import { NextResponse } from "next/server";

// Легкий rule-based фолбек: шукаємо входження бренду в title/snippet (case-insensitive).
function ruleBasedInfer(items: { url: string; title: string; snippet: string }[], brands: string[]) {
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

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}

  const provider = String(body?.provider || "");
  const model = body?.model ? String(body.model) : undefined;
  const items = Array.isArray(body?.items) ? body.items : [];
  const brands = Array.isArray(body?.brands) ? body.brands : [];

  // Якщо потім підключатимеш LLM (OpenAI, Groq, Together тощо) — зробимо гейт тут:
  // if (provider === "openai") { ... } else if (provider === "groq") { ... }

  // Поки що — фолбек без зовнішніх залежностей
  const matches = ruleBasedInfer(
    items.map((x) => ({
      url: String(x?.url || ""),
      title: String(x?.title || ""),
      snippet: String(x?.snippet || ""),
    })),
    brands.map((x) => String(x || ""))
  );

  return NextResponse.json({ matches });
}
