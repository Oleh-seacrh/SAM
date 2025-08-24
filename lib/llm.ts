// /lib/llm.ts
export type LLMProvider = "openai" | "anthropic" | "gemini";

export async function callLLM(opts: {
  provider: LLMProvider;
  model?: string;
  prompt: string;
}): Promise<string> {
  const { provider, model, prompt } = opts;

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "You are a concise business research assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "OpenAI error");
    return json.choices?.[0]?.message?.content || "";
  }

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-3-haiku-20240307",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Anthropic error");
    const text =
      json?.content?.[0]?.text ??
      (Array.isArray(json?.content) ? json.content.map((p: any) => p?.text).join("\n") : "");
    return text || "";
  }

  // gemini
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const usedModel = (model || "gemini-1.5-flash").replace(":generateContent", "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Gemini error");
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// надійно витягнути JSON навіть якщо LLM поверне в ```json
export function extractJson(text: string) {
  const block = text.match(/```json([\s\S]*?)```/i)?.[1] ?? text;
  const firstBrace = block.indexOf("{");
  const firstBracket = block.indexOf("[");
  const start =
    firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  const raw = start >= 0 ? block.slice(start) : block;
  return JSON.parse(raw);
}
