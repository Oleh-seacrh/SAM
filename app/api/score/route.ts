export const runtime = "nodejs";

import { NextRequest } from "next/server";

type Item = { title?: string; snippet?: string; homepage: string; domain: string };
type Body = {
  provider: "openai" | "anthropic" | "gemini";
  model?: string;
  prompt: string;
  items: Item[];
};

function buildUserText(prompt: string, items: Item[]) {
  const list = items.map(i => `- ${i.domain} (${i.homepage})`).join("\n");
  const jsonShape = `Return JSON only in the shape:
{
  "<domain>": {
    "label": "good|maybe|bad",
    "confidence": 0-1,
    "reasons": ["short evidence bullets"],
    "tags": ["distributor","manufacturer","xray-film","chemicals","cassettes","screens","b2b","retail","hospital","blog"]
  }
}`;
  return `${prompt.trim()}

Sites:
${list}

${jsonShape}
Use only evidence from the site (home/product/about pages). If uncertain, choose "maybe" and explain briefly. Output JSON only.`;
}

function extractJson(s: string) {
  try { return JSON.parse(s); } catch {}
  // спробуємо вирізати найбільший JSON-блок
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const cut = s.slice(start, end + 1);
    try { return JSON.parse(cut); } catch {}
  }
  throw new Error("LLM did not return valid JSON");
}

export async function POST(req: NextRequest) {
  const { provider, model, prompt, items } = (await req.json()) as Body;

  if (!items?.length) {
    return Response.json({ error: "No items to score" }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const text = buildUserText(prompt, items);

  let raw = "";
  try {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
      const mdl = model || "gpt-4o-mini";

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: mdl,
          temperature: 0,
          messages: [
            { role: "system", content: "You are a precise B2B prospect classifier. Answer with JSON only." },
            { role: "user", content: text }
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "OpenAI error");
      raw = j.choices?.[0]?.message?.content ?? "";
    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
      const mdl = model || "claude-3-haiku-20240307";

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: mdl,
          max_tokens: 2000,
          temperature: 0,
          messages: [
            { role: "user", content: text }
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Anthropic error");
      raw = j?.content?.[0]?.text ?? "";
    } else {
      // gemini
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return Response.json({ error: "Missing GEMINI_API_KEY/GOOGLE_API_KEY" }, { status: 500 });
      const mdl = model || "gemini-1.5-flash";

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Gemini error");
      raw = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    const parsed = extractJson(raw);

    // нормалізуємо у вигляд { [domain]: {label, confidence, reasons, tags} }
    return Response.json({ scores: parsed });
  } catch (e: any) {
    return Response.json({ error: e.message || "Scoring failed", raw }, { status: 500 });
  }
}
