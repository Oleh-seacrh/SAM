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
  try { return JSON.parse(raw); } catch {}\n  const start = raw.indexOf("{");\n  const end = raw.lastIndexOf("}");\n  if (start >= 0 && end > start) {\n    const cut = raw.slice(start, end + 1);\n    try { return JSON.parse(cut); } catch {}\n  }\n  return { scoresByDomain: {} };\n}

function postProcess(resp: any): LLMResponse {\n  // Accept legacy formats: { domain: {...} } or { scoresByDomain: {...} }\n  const core = resp?.scoresByDomain && typeof resp.scoresByDomain === 'object'\n    ? resp.scoresByDomain\n    : resp && typeof resp === 'object'\n      ? resp\n      : {};

  const out: LLMResponse = { scoresByDomain: {} };\n
  for (const [domain, rawScore] of Object.entries<any>(core)) {\n    if (!rawScore || typeof rawScore !== 'object') continue;\n
    let label: any = rawScore.label;\n    if (!['good','maybe','bad'].includes(label)) label = 'maybe';\n
    let companyType: any = rawScore.companyType || rawScore.company_type || rawScore.type || 'other';\n    if (!['manufacturer','distributor','dealer','other'].includes(companyType)) companyType = 'other';\n
    let countryISO2: string | null = (rawScore.countryISO2 || rawScore.country_iso2 || rawScore.country || null);\n    if (countryISO2) countryISO2 = String(countryISO2).toUpperCase();\n    if (!isISO2(countryISO2)) countryISO2 = null;\n
    let countryName: string | null = rawScore.countryName || rawScore.country_name || null;\n    if (!countryISO2 && countryName && countryName.length < 3) countryName = null; // discard dubious\n
    const confidence = typeof rawScore.confidence === 'number' && rawScore.confidence >= 0 && rawScore.confidence <= 1\n      ? rawScore.confidence\n      : 0.5;\n
    const reasons: string[] = Array.isArray(rawScore.reasons)\n      ? rawScore.reasons.filter(Boolean).slice(0, 10)\n      : [];\n    const tags: string[] = Array.isArray(rawScore.tags)\n      ? rawScore.tags.filter(Boolean).slice(0, 25)\n      : [];\n
    const detectedBrandsRaw: string[] = Array.isArray(rawScore.detectedBrands)\n      ? rawScore.detectedBrands\n      : Array.isArray(rawScore.brands)\n        ? rawScore.brands\n        : [];

    const detectedBrands = dedupe(\n      detectedBrandsRaw\n        .map(b => normalizeBrand(String(b)))\n        .filter(b => b.length > 0 && b.length <= 80)\n        .slice(0, 30)\n    );

    out.scoresByDomain[domain] = {\n      label,\n      confidence,\n      reasons,\n      tags,\n      companyType,\n      countryISO2,\n      countryName,\n      detectedBrands,\n    };\n  }\n  return out;\n}  

/* --------------------------------------------------
 * Main route
 * -------------------------------------------------- */
export async function POST(req: NextRequest) {\n  let raw = "";\n  try {\n    const { provider = "openai", model, prompt, items }: Body = await req.json();\n\n    if (!prompt?.trim()) {\n      return Response.json({ error: "Missing prompt", scoresByDomain: {} }, { status: 400 });\n    }\n    if (!items?.length) {\n      return Response.json({ error: "No items to score", scoresByDomain: {} }, { status: 400 });\n    }\n\n    const userText = await preparePrompt(prompt, items);\n    const mdl = model?.trim();\n\n    if (provider === "openai") {\n      const key = process.env.OPENAI_API_KEY;\n      if (!key) return Response.json({ error: "Missing OPENAI_API_KEY", scoresByDomain: {} }, { status: 500 });\n      const r = await fetch("https://api.openai.com/v1/chat/completions", {\n        method: "POST",\n        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },\n        body: JSON.stringify({\n          model: mdl || "gpt-4o-mini",\n          temperature: 0,\n          messages: [\n            { role: "system", content: "You are a precise extraction assistant. Output ONLY raw JSON." },\n            { role: "user", content: userText },\n          ],\n          max_tokens: 3000,\n        }),\n      });\n      const j = await r.json();\n      raw = j?.choices?.[0]?.message?.content || "";\n      if (!r.ok) throw new Error(j?.error?.message || "OpenAI error");\n    } else if (provider === "anthropic") {\n      const key = process.env.ANTHROPIC_API_KEY;\n      if (!key) return Response.json({ error: "Missing ANTHROPIC_API_KEY", scoresByDomain: {} }, { status: 500 });\n      const r = await fetch("https://api.anthropic.com/v1/messages", {\n        method: "POST",\n        headers: {\n          "x-api-key": key,\n          "anthropic-version": "2023-06-01",\n          "Content-Type": "application/json",\n        },\n        body: JSON.stringify({\n          model: mdl || "claude-3-haiku-20240307",\n          max_tokens: 3000,\n          temperature: 0,\n          system: "You are a precise extraction assistant. Output ONLY raw JSON.",\n          messages: [{ role: "user", content: userText }],\n        }),\n      });\n      const j = await r.json();\n      raw = j?.content?.[0]?.text || "";\n      if (!r.ok) throw new Error(j?.error?.message || "Anthropic error");\n    } else if (provider === "gemini") {\n      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;\n      if (!key) return Response.json({ error: "Missing GEMINI_API_KEY/GOOGLE_API_KEY", scoresByDomain: {} }, { status: 500 });\n      const mdlName = mdl || "gemini-1.5-flash";\n      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdlName)}:generateContent?key=${key}`, {\n        method: "POST",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({\n          contents: [{ parts: [{ text: userText }] }],\n          generationConfig: { temperature: 0 },\n        }),\n      });\n      const j = await r.json();\n      raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";\n      if (!r.ok) throw new Error(j?.error?.message || "Gemini error");\n    } else {\n      return Response.json({ error: "Unsupported provider", scoresByDomain: {} }, { status: 400 });\n    }\n\n    const parsed = tryParseJSON(raw);\n    const processed = postProcess(parsed);\n    return Response.json(processed);\n  } catch (e: any) {\n    console.error("/api/score error", e?.message);\n    return Response.json({ scoresByDomain: {}, error: e?.message || "Scoring failed", raw }, { status: 500 });\n  }\n}