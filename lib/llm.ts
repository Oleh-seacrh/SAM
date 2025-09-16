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
// lib/llm.ts

export type LLMProvider = "openai" | "anthropic" | "gemini";

/* -------------------- TEXT-ONLY (твоя наявна функція, лишаємо) -------------------- */
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

/* -------------------- JSON EXTRACT (твоя helper, лишаємо) -------------------- */
export function extractJson(text: string) {
  const block = text.match(/```json([\s\S]*?)```/i)?.[1] ?? text;
  const firstBrace = block.indexOf("{");
  const firstBracket = block.indexOf("[");
  const start =
    firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  const raw = start >= 0 ? block.slice(start) : block;
  return JSON.parse(raw);
}

/* -------------------- VISION + STRICT JSON (нове) -------------------- */

export type InquiryJSON = {
  who: { name: string | null; email: string | null; phone: string | null; source: "email" | "whatsapp" | "other" };
  company: { legalName: string | null; displayName: string | null; domain: string | null; country: string | null };
  intent: { type: "RFQ" | "Buy" | "Info" | "Support"; brand: string | null; product: string | null; quantity: string | null; freeText: string | null };
};

function normalizeInquiry(j: any): InquiryJSON {
  return {
    who: {
      name: j?.who?.name ?? null,
      email: j?.who?.email ?? null,
      phone: j?.who?.phone ?? null,
      source: (j?.who?.source ?? "other") as "email" | "whatsapp" | "other",
    },
    company: {
      legalName: j?.company?.legalName ?? null,
      displayName: j?.company?.displayName ?? null,
      domain: j?.company?.domain ?? null,
      country: j?.company?.country ?? null,
    },
    intent: {
      type: (j?.intent?.type ?? "Info") as "RFQ" | "Buy" | "Info" | "Support",
      brand: j?.intent?.brand ?? null,
      product: j?.intent?.product ?? null,
      quantity: j?.intent?.quantity ?? null,
      freeText: j?.intent?.freeText ?? null,
    },
  };
}

function parseDataUrl(dataUrl?: string): { mime?: string; base64?: string } {
  if (!dataUrl) return {};
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return {};
  return { mime: m[1], base64: m[2] };
}

/**
 * extractInquiry:
 * - Працює з OpenAI / Anthropic / Gemini
 * - Приймає optional imageDataUrl (data:<mime>;base64,....)
 * - Повертає строгий JSON (тип InquiryJSON)
 */
export async function extractInquiry(opts: {
  provider: LLMProvider;
  model?: string;
  prompt: string;
  imageDataUrl?: string;
}): Promise<InquiryJSON> {
  const { provider, model, prompt, imageDataUrl } = opts;

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const messages: any[] = [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...(imageDataUrl ? [{ type: "image_url", image_url: { url: imageDataUrl } }] : [])
      ]
    }];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" }, // просимо строгий JSON
        messages
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "OpenAI error");
    const text = json.choices?.[0]?.message?.content || "{}";
    return normalizeInquiry(JSON.parse(text));
  }

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing ANTHROPIC_API_KEY");

    const img = parseDataUrl(imageDataUrl);
    const content: any[] = [{ type: "text", text: prompt }];
    if (img?.base64 && img?.mime) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mime, data: img.base64 }
      });
    }

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
        messages: [{ role: "user", content }]
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Anthropic error");
    const text =
      json?.content?.[0]?.text ??
      (Array.isArray(json?.content) ? json.content.map((p: any) => p?.text).join("\n") : "{}");
    return normalizeInquiry(extractJson(text));
  }

  // gemini
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  const usedModel = (model || "gemini-1.5-flash").replace(":generateContent", "");
  const parts: any[] = [{ text: prompt }];
  const img = parseDataUrl(imageDataUrl);
  if (img?.base64 && img?.mime) {
    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Gemini error");
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join("") || "{}";
  return normalizeInquiry(extractJson(text));
}
