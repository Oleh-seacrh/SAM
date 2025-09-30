// app/api/intake/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractInquiry, LLMProvider } from "@/lib/llm";

export const runtime = "nodejs";

/* ================== TYPES (канон для intake) ================== */
type Who = {
  name: string | null;
  email: string | null;
  phone: string | null;
  source: "email" | "whatsapp" | "other";
};

type Company = {
  legalName: string | null;
  displayName: string | null;
  domain: string | null;
  country_iso2: string | null;
};

type Intent = {
  brand: string | null;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

type Meta = {
  languages: string[];
  detected_text: string[];
  confidence: number | null;
  raw?: any;
};

type IntakeResult = {
  who: Who;
  company: Company;
  intent: Intent;
  meta: Meta;
};

/* ================== HELPERS ================== */

/**
 * Витягає потенційний номер телефону з масиву рядків (fallback на випадок, якщо LLM не дав phone).
 */
function extractPhoneFallback(lines: string[]): string | null {
  const text = lines.join(" ");
  // Патерн: або міжнародний +XXXXXXXX, або кілька груп цифр з пробілами/дефісами.
  const m = text.match(/(\+\d{7,15}|\b\d{3,4}[-\s]?\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}\b)/);
  return m ? m[1] : null;
}

type SelfShape = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  domain?: string;
  country?: string;
};

/**
 * Формує промпт для LLM (мультимовний, WhatsApp-friendly).
 */
function buildPrompt(self: SelfShape | null) {
  const parts: string[] = [];
  if (self?.name) parts.push(`Я — ${self.name}`);
  if (self?.company) parts.push(`компанія ${self.company}`);
  if (self?.email) parts.push(`email: ${self.email}`);
  if (self?.phone) parts.push(`телефон: ${self.phone}`);
  if (self?.domain) parts.push(`domain: ${self.domain}`);
  if (self?.country) parts.push(`country: ${self.country}`);

  const meLine = parts.length ? parts.join(", ") : "Я — користувач SAM.";

  return `
${meLine}

SELF_PROFILE (this is our own organization – NEVER use these values as the external contact):
Name: ${self?.name || 'N/A'}
Company: ${self?.company || 'N/A'}
Email: ${self?.email || 'N/A'}
Domain: ${self?.domain || 'N/A'}
Country: ${self?.country || 'N/A'}
SELF_DOMAINS: [${self?.domain || 'N/A'}, www.${self?.domain || 'N/A'}]

Контекст: на вхід подається СКРІН/ФОТО, часто це скрін WhatsApp або іншого месенджера.
Твоє завдання:
1) ІГНОРУЙ елементи інтерфейсу (кнопки, іконки, статуси, UI WhatsApp/Android/iOS).
2) ВИТЯГАЙ ТЕКСТ НЕЗАЛЕЖНО ВІД МОВИ (арабська, англійська, українська, російська тощо).
3) Якщо є дані профілю/контакту — знайди ім'я, email, телефон, можливу компанію.
4) Якщо у змісті діалогу є запит/інтерес — витягни brand, product, quantity, unit, notes (якщо можна).
5) Не вигадуй: якщо даних немає — став null.
6) Обовʼязково meta.languages (масив ISO/кодових позначень мов, якщо можна), meta.detected_text (масив рядків з сирим текстом у[...] 
7) Джерело (who.source): якщо виглядає як месенджер (особливо WhatsApp) — "whatsapp", інакше "other" (або "email" якщо очевидно лис[...] 

ПОВЕРНИ СТРОГИЙ JSON БЕЗ ПОЯСНень:
{
  "who": {"name": null|string, "email": null|string, "phone": null|string, "source": "email"|"whatsapp"|"other"},
  "company": {"legalName": null|string, "displayName": null|string, "domain": null|string, "country_iso2": null|string},
  "intent": {"brand": null|string, "product": null|string, "quantity": null|number, "unit": null|string, "notes": null|string},
  "meta": {"languages": string[]|null, "detected_text": string[]|null, "confidence": null|number}
}

Правила:
- Телефон бажано в міжнародному форматі, якщо видно код (наприклад +218...).
- Не додавай інших полів. Без коментарів. Лише JSON.
`;
}

/**
 * Жорстко нормалізує сирий вивід моделі (щоб не ламати фронт).
 */
function normalizeResult(raw: any): IntakeResult {
  const safe = (v: any, fb: any) => (v === undefined ? fb : v);

  const who: Who = {
    name: null,
    email: null,
    phone: null,
    source: "other",
  };
  const company: Company = {
    legalName: null,
    displayName: null,
    domain: null,
    country_iso2: null,
  };
  const intent: Intent = {
    brand: null,
    product: null,
    quantity: null,
    unit: null,
    notes: null,
  };
  const meta: Meta = {
    languages: [],
    detected_text: [],
    confidence: null,
    raw,
  };

  try {
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;

    who.name = safe(r?.who?.name, null);
    who.email = safe(r?.who?.email, null);
    who.phone = safe(r?.who?.phone, null);
    who.source = safe(r?.who?.source, "other");

    company.legalName = safe(r?.company?.legalName, null);
    company.displayName = safe(r?.company?.displayName, null);
    company.domain = safe(r?.company?.domain, null);
    company.country_iso2 = safe(r?.company?.country_iso2, null);

    intent.brand = safe(r?.intent?.brand, null);
    intent.product = safe(r?.intent?.product, null);
    intent.quantity = safeNumber(r?.intent?.quantity);
    intent.unit = safe(r?.intent?.unit, null);
    intent.notes = safe(r?.intent?.notes, null);

    meta.languages = Array.isArray(r?.meta?.languages) ? r.meta.languages : [];
    meta.detected_text = Array.isArray(r?.meta?.detected_text) ? r.meta?.detected_text : [];
    meta.confidence = safeNumber(r?.meta?.confidence);
  } catch {
    // Якщо не вдалось розпарсити — залишаємо заготовки, raw вже збережений.
  }

  return { who, company, intent, meta };
}

function safeNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ================== MAIN ROUTE ================== */

export async function POST(req: NextRequest) {
  const timeStarted = Date.now();
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Провайдер / модель
    const provider = (form.get("provider") as LLMProvider) || "openai";
    const model = (form.get("model") as string) || undefined;

    // -------- self_json + fallback --------
    let self: SelfShape = {
      name: (form.get("self_name") as string) || undefined,
      company: (form.get("self_company") as string) || undefined,
      email: (form.get("self_email") as string) || undefined,
      phone: (form.get("self_phone") as string) || undefined,
    };
    const selfJson = form.get("self_json") as string | null;
    if (selfJson) {
      try {
        const parsed = JSON.parse(selfJson);
        self = {
          name: parsed?.name || self.name,
          company: parsed?.company || self.company,
          email: parsed?.email || self.email,
          phone: parsed?.phone || self.phone,
          domain: parsed?.domain || parsed?.company_domain || self.domain,
          country: parsed?.country || parsed?.company_country || self.country,
        };
      } catch (e) {
        console.warn("[intake/image] Failed to parse self_json:", e);
      }
    }

    // -------- Convert image to data URL --------
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const mime = file.type || "image/jpeg";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    // -------- Prompt --------
    const prompt = buildPrompt(self);

    // -------- Call LLM --------
    let llmRaw: any;
    try {
      llmRaw = await extractInquiry({
        provider,
        model,
        prompt,
        imageDataUrl: dataUrl,
      });
    } catch (e: any) {
      console.error("[intake/image] LLM call failed:", e);
      return NextResponse.json(
        {
          ok: false,
          error: "LLM extraction failed",
          detail: e?.message || String(e),
        },
        { status: 500 }
      );
    }

    // -------- Normalize --------
    const normalized = normalizeResult(llmRaw);

    // -------- Fallback adjustments --------

    // If source missing -> assume whatsapp
    if (!normalized.who?.source) {
      normalized.who.source = "whatsapp";
    }

    // Phone fallback from detected_text
    if (!normalized.who.phone && normalized.meta.detected_text.length) {
      const fallbackPhone = extractPhoneFallback(normalized.meta.detected_text);
      if (fallbackPhone) normalized.who.phone = fallbackPhone;
    }

    // Company guard (already not null by design, але лишаємо безпечність)
    normalized.company.legalName = normalized.company.legalName ?? null;
    normalized.company.displayName = normalized.company.displayName ?? null;
    normalized.company.domain = normalized.company.domain ?? null;
    normalized.company.country_iso2 = normalized.company.country_iso2 ?? null;

    // Intent guard
    normalized.intent.brand = normalized.intent.brand ?? null;
    normalized.intent.product = normalized.intent.product ?? null;
    normalized.intent.quantity = normalized.intent.quantity ?? null;
    normalized.intent.unit = normalized.intent.unit ?? null;
    normalized.intent.notes = normalized.intent.notes ?? null;

    const durationMs = Date.now() - timeStarted;

    // -------- Response (BACKWARD COMPAT) --------
    // IMPORTANT: фронт зараз очікує payload.normalized.*
    return NextResponse.json(
      {
        ok: true,
        normalized, // фронт бере це
        data: normalized, // залишаємо синонім (може бути корисно у нових частинах)
        self, // для дебагу (можна видалити пізніше)
        meta: {
          provider,
          model: model || null,
          mime,
          size_bytes: bytes.length,
          duration_ms: durationMs,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[intake/image] fatal error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}