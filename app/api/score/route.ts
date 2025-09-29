export const runtime = "nodejs";

import { NextRequest } from "next/server";

// Types for request
interface Item {
  title?: string;
  snippet?: string;
  homepage: string;
  domain: string;
}
interface Body {
  provider?: "openai" | "anthropic" | "gemini";
  model?: string;
  prompt: string;
  items: Item[];
}

// Types for LLM scoring output
interface LLMScore {
  label: "good" | "maybe" | "bad";
  confidence: number;
  reasons: string[];
  tags: string[];
  companyType: "manufacturer" | "distributor" | "dealer" | "other";
  countryISO2: string | null;
  countryName: string | null;
  detectedBrands: string[];
}
interface LLMResponse {
  scoresByDomain: Record<string, LLMScore>;
  error?: string;
  raw?: string;
}

/* --------------------------------------------------
 * Fetch homepage content (parallel) with timeout & simple HTML -> text extraction
 * -------------------------------------------------- */
async function fetchHomepageContent(url: string, timeoutMs = 5000): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    if (!r.ok) return "";
    const html = await r.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--.*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    return text;
  } catch (e: any) {
    console.warn("fetchHomepageContent fail:", url, e?.message);
    return "";
  } finally {
    clearTimeout(id);
  }
}

/* --------------------------------------------------
 * Helpers
 * -------------------------------------------------- */
function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function isISO2(v: string | null | undefined): v is string { return !!v && /^[A-Z]{2}$/.test(v); }
function normalizeBrand(b: string): string { return b.trim().replace(/[\s]+/g, " ").replace(/[.,;:!?]+$/g, ""); }

function buildPrompt(prompt: string, enriched: (Item & { content: string })[]) {
  const sites = enriched
    .map(
      i => `- ${i.domain} (${i.homepage})\n  Title: ${i.title || "N/A"}\n  Snippet: ${i.snippet || "N/A"}\n  Homepage content: ${i.content.slice(0, 1500)}...`
    )
    .join("\n\n");

  const jsonShape = `Return ONLY raw JSON with NO markdown/backticks in the shape:\n{\n  \"scoresByDomain\": {\n    \"<domain>\": {\n      \"label\": \"good\" | \"maybe\" | \"bad\",\n      \"confidence\": 0.0,\n      \"reasons\": [\"...\"],\n      \"tags\": [\"...\"],\n      \"companyType\": \"manufacturer\" | \"distributor\" | \"dealer\" | \"other\",\n      \"countryISO2\": \"XX\" | null,\n      \"countryName\": \"Country name\" | null,\n      \"detectedBrands\": [\"Brand1\",\"Brand2\"]\n    }\n  }\n}`;

  return `You are an expert B2B prospecting assistant for medical imaging consumables (X-ray film, plates, chemistry, cassettes, viewers).\nInfer EVERYTHING *only* from provided data (title, snippet, homepage content).\nIf a field is unknown use null (for country) or [] (for arrays). DO NOT hallucinate.\nAlways include ALL keys for every domain even if arrays are empty or values null.\nRules:\n- GOOD: clear relevant supplier (manufacturer / distributor / dealer) of imaging consumables\n- MAYBE: partially relevant or uncertain\n- BAD: blogs, news, directories only, unrelated, marketplaces\nCountry: only if explicitly mentioned (address, clear textual country name, phone + supporting evidence). Otherwise null.\nCompanyType: manufacturer / distributor / dealer / other (if unclear -> other).\nBrands: ONLY those explicitly present in text; dedupe; keep plain casing (no enrichment).\nConfidence: 0..1 float.\n\nUser focus prompt:\n${prompt.trim()}\n\nSites to analyze:\n${sites}\n\n${jsonShape}\nOutput ONLY JSON.`;
}

async function preparePrompt(prompt: string, items: Item[]) {
  const enriched = await Promise.all(
    items.map(async it => ({ ...it, content: await fetchHomepageContent(it.homepage) || "No content available" }))
  );
  return buildPrompt(prompt, enriched);
}

function tryParseJSON(raw: string): any {
  try { return JSON.parse(raw); } catch {}\n  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const cut = raw.slice(start, end + 1);
    try { return JSON.parse(cut); } catch {}
  }
  return { scoresByDomain: {} };
}

function postProcess(resp: any): LLMResponse {
  // Accept legacy formats: { domain: {...} } or { scoresByDomain: {...} }
  const core = resp?.scoresByDomain && typeof resp.scoresByDomain === 'object'
    ? resp.scoresByDomain
    : resp && typeof resp === 'object'
      ? resp
      : {};

  const out: LLMResponse = { scoresByDomain: {} };

  for (const [domain, rawScore] of Object.entries<any>(core)) {
    if (!rawScore || typeof rawScore !== 'object') continue;

    let label: any = rawScore.label;
    if (!['good','maybe','bad'].includes(label)) label = 'maybe';

    let companyType: any = rawScore.companyType || rawScore.company_type || rawScore.type || 'other';
    if (!['manufacturer','distributor','dealer','other'].includes(companyType)) companyType = 'other';

    let countryISO2: string | null = (rawScore.countryISO2 || rawScore.country_iso2 || rawScore.country || null);
    if (countryISO2) countryISO2 = String(countryISO2).toUpperCase();
    if (!isISO2(countryISO2)) countryISO2 = null;

    let countryName: string | null = rawScore.countryName || rawScore.country_name || null;
    if (!countryISO2 && countryName && countryName.length < 3) countryName = null; // discard dubious

    const confidence = typeof rawScore.confidence === 'number' && rawScore.confidence >= 0 && rawScore.confidence <= 1
      ? rawScore.confidence
      : 0.5;

    const reasons: string[] = Array.isArray(rawScore.reasons)
      ? rawScore.reasons.filter(Boolean).slice(0, 10)
      : [];
    const tags: string[] = Array.isArray(rawScore.tags)
      ? rawScore.tags.filter(Boolean).slice(0, 25)
      : [];

    const detectedBrandsRaw: string[] = Array.isArray(rawScore.detectedBrands)
      ? rawScore.detectedBrands
      : Array.isArray(rawScore.brands)
        ? rawScore.brands
        : [];

    const detectedBrands = dedupe(
      detectedBrandsRaw
        .map(b => normalizeBrand(String(b)))
        .filter(b => b.length > 0 && b.length <= 80)
        .slice(0, 30)
    );

    out.scoresByDomain[domain] = {
      label,
      confidence,
      reasons,
      tags,
      companyType,
      countryISO2,
      countryName,
      detectedBrands,
    };
  }
  return out;
}

/* --------------------------------------------------
 * Main route
 * -------------------------------------------------- */
export async function POST(req: NextRequest) {
  let raw = "";
  try {
    const { provider = "openai", model, prompt, items }: Body = await req.json();

    if (!prompt?.trim()) {
      return Response.json({ error: "Missing prompt", scoresByDomain: {} }, { status: 400 });
    }
    if (!items?.length) {
      return Response.json({ error: "No items to score", scoresByDomain: {} }, { status: 400 });
    }

    const userText = await preparePrompt(prompt, items);
    const mdl = model?.trim();

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return Response.json({ error: "Missing OPENAI_API_KEY", scoresByDomain: {} }, { status: 500 });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: mdl || "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: "You are a precise extraction assistant. Output ONLY raw JSON." },
            { role: "user", content: userText },
          ],
          max_tokens: 3000,
        }),
      });
      const j = await r.json();
      raw = j?.choices?.[0]?.message?.content || "";
      if (!r.ok) throw new Error(j?.error?.message || "OpenAI error");
    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return Response.json({ error: "Missing ANTHROPIC_API_KEY", scoresByDomain: {} }, { status: 500 });
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: mdl || "claude-3-haiku-20240307",
          max_tokens: 3000,
          temperature: 0,
          system: "You are a precise extraction assistant. Output ONLY raw JSON.",
          messages: [{ role: "user", content: userText }],
        }),
      });
      const j = await r.json();
      raw = j?.content?.[0]?.text || "";
      if (!r.ok) throw new Error(j?.error?.message || "Anthropic error");
    } else if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return Response.json({ error: "Missing GEMINI_API_KEY/GOOGLE_API_KEY", scoresByDomain: {} }, { status: 500 });
      const mdlName = mdl || "gemini-1.5-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdlName)}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: { temperature: 0 },
        }),
      });
      const j = await r.json();
      raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!r.ok) throw new Error(j?.error?.message || "Gemini error");
    } else {
      return Response.json({ error: "Unsupported provider", scoresByDomain: {} }, { status: 400 });
    }

    const parsed = tryParseJSON(raw);
    const processed = postProcess(parsed);
    return Response.json(processed);
  } catch (e: any) {
    console.error("/api/score error", e?.message);
    return Response.json({ scoresByDomain: {}, error: e?.message || "Scoring failed", raw }, { status: 500 });
  }
}