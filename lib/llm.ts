// lib/llm.ts

export type LLMProvider = "openai" | "anthropic" | "gemini";

/* ===================== Defaults & helpers ===================== */
export const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-haiku-20240307",
  gemini: "gemini-1.5-flash",
} as const;

function ensureModel(provider: LLMProvider, model?: string) {
  if (model && model.trim()) return model;
  return DEFAULT_MODELS[provider] as string;
}

export function extractJson(text: string) {
  const block = text.match(/```json([\s\S]*?)```/i)?.[1] ?? text;
  const firstBrace = block.indexOf("{");
  const firstBracket = block.indexOf("[");
  const start =
    firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  const raw = start >= 0 ? block.slice(start) : block;
  return JSON.parse(raw);
}

function safeParseJsonObject(text: string): any {
  try { return JSON.parse(text); } catch {}
  try { return extractJson(text); } catch {}
  const i1 = text.indexOf("{");
  const i2 = text.indexOf("[");
  const i = (i1 === -1) ? i2 : (i2 === -1 ? i1 : Math.min(i1, i2));
  if (i >= 0) {
    const t = text.slice(i);
    try { return JSON.parse(t); } catch {}
  }
  return {};
}

function parseDataUrl(dataUrl?: string): { mime?: string; base64?: string } {
  if (!dataUrl) return {};
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return {};
  return { mime: m[1], base64: m[2] };
}

export function hasVisionKeys(provider: LLMProvider) {
  switch (provider) {
    case "openai":    return !!process.env.OPENAI_API_KEY;
    case "anthropic": return !!process.env.ANTHROPIC_API_KEY;
    case "gemini":    return !!process.env.GEMINI_API_KEY;
  }
}

/* ===================== TEXT-ONLY ===================== */
export async function callLLM(opts: {
  provider: LLMProvider;
  model?: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { provider, model, prompt, signal } = opts;

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal,
      body: JSON.stringify({
        model: ensureModel("openai", model),
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
    // Заглушка (щоб не ламати існуючі виклики)
    throw new Error("Anthropic text-only call is not implemented yet");
  }

  // provider === "gemini"
  throw new Error("Gemini text-only call is not implemented yet");
}

/* ===================== VISION + STRICT JSON ===================== */
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

/** Vision-витяг суворого JSON: OpenAI реалізовано, інші — заглушки */
export async function extractInquiry(opts: {
  provider: LLMProvider;
  model?: string;
  prompt: string;
  imageDataUrl?: string;
  signal?: AbortSignal;
}): Promise<InquiryJSON> {
  const { provider, model, prompt, imageDataUrl, signal } = opts;
  const effectiveModel = ensureModel(provider, model);

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    // Використовуємо Responses API, якщо ввімкнено прапор (стабільніше з json_object)
    if (process.env.OPENAI_USE_RESPONSES === "1") {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        signal,
        body: JSON.stringify({
          model: effectiveModel,
          input: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...(imageDataUrl ? [{ type: "input_image", image_url: imageDataUrl }] : []),
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_output_tokens: 700,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);

      const text =
        data?.output?.[0]?.content?.[0]?.text ||
        data?.output_text ||
        data?.choices?.[0]?.message?.content ||
        "{}";

      return normalizeInquiry(safeParseJsonObject(text));
    }

    // Chat Completions з мультимодалкою
    const messages: any[] = [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...(imageDataUrl ? [{ type: "image_url", image_url: { url: imageDataUrl } }] : []),
      ],
    }];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      signal,
      body: JSON.stringify({
        model: effectiveModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `OpenAI error ${res.status}`);
    const text = json?.choices?.[0]?.message?.content || "{}";
    return normalizeInquiry(safeParseJsonObject(text));
  }

  if (provider === "anthropic") {
    // Акуратна заглушка
    throw new Error("Anthropic vision extract is not implemented yet");
  }

  // provider === "gemini"
  throw new Error("Gemini vision extract is not implemented yet");
}
 
