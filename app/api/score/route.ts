// /app/api/score/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { callLLM, extractJson, LLMProvider } from "@/lib/llm";

type Item = { title: string; snippet?: string; homepage: string; domain: string };
type Score = { domain: string; label: "good" | "maybe" | "bad"; confidence?: number; reasons?: string[]; tags?: string[] };

const defaultInstruction = `
You are ranking potential B2B prospects from web search.
Return STRICT JSON with this TypeScript type:
type Score = { domain: string; label: "good" | "maybe" | "bad"; confidence?: number; reasons?: string[]; tags?: string[] };
Input is up to 10 items = {title, snippet, homepage, domain}. Decide per domain.
- "good": clear fit (supplier/distributor/manufacturer/reseller for the niche)
- "maybe": unclear fit, needs human review
- "bad": irrelevant (blog, news, generic marketplace, consumer-only)
Rules:
- One object per domain (no duplicates).
- Keep reasons short.
- Output ONLY JSON array of Score (no prose).
`;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider: LLMProvider;
      model?: string;
      prompt?: string;
      items: Item[];
    };

    let { provider, model, prompt, items } = body || {};
    if (!provider || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "provider + items required" }, { status: 400 });
    }
    items = items.slice(0, 10); // безпечно для API

    const userPrompt = (prompt || "").trim();
    const merged = `${defaultInstruction}\nUser criteria:\n${userPrompt || "(none)"}\n\nItems JSON:\n${JSON.stringify(
      items,
      null,
      2
    )}`;

    const raw = await callLLM({ provider, model, prompt: merged });
    let parsed: Score[];
    try {
      parsed = extractJson(raw);
    } catch {
      // fallback: позначити все як "maybe"
      parsed = items.map((it) => ({ domain: it.domain, label: "maybe", reasons: ["LLM parse failed"] }));
    }

    // до мапи
    const byDomain: Record<string, Score> = {};
    for (const s of parsed) {
      if (!s?.domain || !s?.label) continue;
      if (!["good", "maybe", "bad"].includes(s.label)) continue;
      byDomain[s.domain] = s;
    }

    return Response.json({ ok: true, scores: byDomain, raw });
  } catch (e: any) {
    return Response.json({ error: e.message || "LLM scoring failed" }, { status: 500 });
  }
}
