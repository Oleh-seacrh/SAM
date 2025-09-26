// app/api/brand-inference/route.ts
import { NextResponse } from "next/server";

type Item = { url: string; title: string; snippet: string };
type Body = {
  provider?: string; // "openai" | ...
  model?: string;
  items?: Item[];
  brands?: string[];
};

function ruleBasedInfer(items: Item[], brands: string[]) {
  const out: { url: string; brands: string[] }[] = [];
  for (const it of items) {
    const hay = `${it.title}\n${it.snippet}`.toLowerCase();
    const hit: string[] = [];
    for (const b of brands) {
      const needle = b.toLowerCase();
      if (needle && hay.includes(needle)) hit.push(b);
    }
    out.push({ url: it.url, brands: Array.from(new Set(hit)) });
  }
  return out;
}

async function openAIInfer(model: string, items: Item[], brands: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // немає ключа → нехай фолбек відпрацює

  const sys = `You are given a list of web search results and a whitelist of brand names.
Return, for each item, ONLY the brand names that clearly appear to be relevant to the company behind that item.
Output strict JSON: {"matches":[{"url":"...","brands":["Brand A","Brand B"]}, ...]}.`;

  const user = JSON.stringify({ brands, items }, null, 2);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!res.ok) {
    // не валимо всю відповідь — просто повернемо null, щоб спрацював фолбек
    return null;
  }

  const json = await res.json().catch(() => ({}));
  const text = json?.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(text);
    const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
    // нормалізація
    return matches.map((m: any) => ({
      url: String(m?.url || ""),
      brands: Array.isArray(m?.brands) ? m.brands.map((x: any) => String(x || "")).filter(Boolean) : []
    }));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body = {};
  try { body = await req.json(); } catch {}

  const provider = (body.provider || "").toLowerCase();
  const model = body.model || "";
  const items = Array.isArray(body.items) ? body.items : [];
  const brands = Array.isArray(body.brands) ? body.brands : [];

  if (!items.length || !brands.length) {
    return NextResponse.json({ matches: [] });
  }

  // 1) Якщо провайдер openai і є ключ — пробуємо LLM
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const llm = await openAIInfer(model, items, brands);
    if (llm) {
      // успіх — віддаємо LLM-результат
      return NextResponse.json({ matches: llm });
    }
    // якщо не вийшло — падаємо у фолбек
  }

  // 2) Фолбек (rule-based) — працює завжди
  const rb = ruleBasedInfer(items, brands);
  return NextResponse.json({ matches: rb });
}
