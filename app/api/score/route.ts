export const runtime = "nodejs";

import { NextRequest } from "next/server";

// ---------------- Types ----------------
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

// ---------------- Fetch & Extract ----------------
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
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--.*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
  } catch (e: any) {
    console.warn("fetchHomepageContent fail:", url, e?.message);
    return "";
  } finally {
    clearTimeout(id);
  }
}

// ---------------- Helpers ----------------
function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
function isISO2(v: string | null | undefined): v is string {
  return !!v && /^[A-Z]{2}$/.test(v);
}
function normalizeBrand(b: string): string {
  return b.trim().replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
}

function buildPrompt(prompt: string, enriched: (Item & { content: string })[]) {
  const sitesBlock = enriched
    .map(
      i =>
        `- ${i.domain} (${i.homepage})
  Title: ${i.title || "N/A"}
  Snippet: ${i.snippet || "N/A"}
  Homepage content: ${i.content.slice(0, 1500)}...`
    )
    .join("\n\n");

  const jsonShape = `Return ONLY raw JSON (no markdown/backticks) with shape:
{
  "scoresByDomain": {
    "<domain>": {
      "label": "good" | "maybe" | "bad",
      "confidence": 0.0,
      "reasons": ["..."],
      "tags": ["..."],
      "companyType": "manufacturer" | "distributor" | "dealer" | "other",
      "countryISO2": "XX" | null,
      "countryName": "Country name" | null,
      "detectedBrands": ["Brand1","Brand2"]
    }
  }
}`;

  return `You are an expert B2B prospecting assistant for medical imaging consumables (X-ray film, plates, chemistry, cassettes, viewers).
Infer EVERYTHING only from provided data (title, snippet, homepage content).
ALWAYS include every key for each domain.
Rules:
- GOOD: clear relevant supplier (manufacturer / distributor / dealer) of imaging consumables
- MAYBE: partially relevant / uncertain
- BAD: blogs, news, generic directories/marketplaces, unrelated
Country: only if explicitly mentioned (address, textual country name, phone code with context). Else null.
CompanyType: manufacturer / distributor / dealer / other (if unclear -> other).
Brands: ONLY explicitly present tokens; dedupe; do not invent.
Confidence: 0..1 float.

User focus prompt:
${prompt.trim()}

Sites to analyze:
${sitesBlock}

${jsonShape}
Output ONLY JSON.`;
}

async function preparePrompt(prompt: string, items: Item[]) {
  const enriched = await Promise.all(
    items.map(async it => ({
      ...it,
      content: (await fetchHomepageContent(it.homepage)) || "No content available",
    }))
  );
  return buildPrompt(prompt, enriched);
}

function tryParseJSON(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const cut = raw.slice(start, end + 1);
    try {
      return JSON.parse(cut);
    } catch {}
  }
  return { scoresByDomain: {} };
}

function postProcess(resp: any): LLMResponse {
  const core =
    resp?.scoresByDomain && typeof resp.scoresByDomain === "object"
      ? resp.scoresByDomain
      : resp && typeof resp === "object"
      ? resp
      : {};

  const out: LLMResponse = { scoresByDomain: {} };

  for (const [domain, rawScore] of Object.entries<any>(core)) {
    if (!rawScore || typeof rawScore !== "object") continue;

    let label: any = rawScore.label;
    if (!["good", "maybe", "bad"].includes(label)) label = "maybe";

    let companyType: any =
      rawScore.companyType || rawScore.company_type || rawScore.type || "other";
    if (!["manufacturer", "distributor", "dealer", "other"].includes(companyType))
      companyType = "other";

    let countryISO2: string | null =
      rawScore.countryISO2 || rawScore.country_iso2 || rawScore.country || null;
    if (countryISO2) countryISO2 = String(countryISO2).toUpperCase();
    if (!isISO2(countryISO2)) countryISO2 = null;

    let countryName: string | null =
      rawScore.countryName || rawScore.country_name || null;
    if (!countryISO2 && countryName && countryName.length < 3) countryName = null;

    const confidence =
      typeof rawScore.confidence === "number" &&
      rawScore.confidence >= 0 &&
      rawScore.confidence <= 1
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

// ---------------- Main Route ----------------
export async function POST(req: NextRequest) {
  let raw = "";
  try {
    const { provider = "openai", model, prompt, items }: Body = await req.json();

    if (!prompt?.trim()) {
      return Response.json(
        { error: "Missing prompt", scoresByDomain: {} },
        { status: 400 }
      );
    }
    if (!items?.length) {
      return Response.json(
        { error: "No items to score", scoresByDomain: {} },
        { status: 400 }
      );
    }

    const userText = await preparePrompt(prompt, items);
    const mdl = model?.trim();

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key)
        return Response.json(
          { error: "Missing OPENAI_API_KEY", scoresByDomain: {} },
          { status: 500 }
        );
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: mdl || "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a precise extraction assistant. Output ONLY raw JSON.",
            },
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
      if (!key)
        return Response.json(
          { error: "Missing ANTHROPIC_API_KEY", scoresByDomain: {} },
          { status: 500 }
        );
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
      if (!key)
        return Response.json(
          { error: "Missing GEMINI_API_KEY/GOOGLE_API_KEY", scoresByDomain: {} },
          { status: 500 }
        );
      const mdlName = mdl || "gemini-1.5-flash";
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          mdlName
        )}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userText }] }],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      const j = await r.json();
      raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!r.ok) throw new Error(j?.error?.message || "Gemini error");
    } else {
      return Response.json(
        { error: "Unsupported provider", scoresByDomain: {} },
        { status: 400 }
      );
    }

    const parsed = tryParseJSON(raw);
    const processed = postProcess(parsed);
    return Response.json(processed);
  } catch (e: any) {
    console.error("/api/score error", e?.message);
    return Response.json(
      { scoresByDomain: {}, error: e?.message || "Scoring failed", raw },
      { status: 500 }
    );
  }
}
