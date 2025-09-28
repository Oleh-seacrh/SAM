// app/api/intake/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractInquiry, LLMProvider } from "@/lib/llm";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

// -------- types (узгоджені з нашим каноном для intake) ----------
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
  country_iso2?: string | null;
};

type Intent = {
  brand: string | null;
  product: string | null;
  quantity: number | null;
  unit: string | null; // e.g., "pcs", "sets"
  notes: string | null;
};

type Meta = {
  languages?: string[]; // ["ar","en","uk",...]
  detected_text?: string[]; // сирий витяг тексту (рядки)
  confidence?: number | null;
  raw?: any; // оригінальна відповідь моделі
};

type IntakeResult = {
  who: Who;
  company: Company;
  intent: Intent;
  meta: Meta;
};

// ---------------- helpers ----------------

/**
 * Простий витяг телефону з масиву рядків (fallback).
 */
function extractPhoneFallback(lines: string[]): string | null {
  const text = lines.join(" ");
  // Лібійський код +218 теж покриємо. Шукаємо +, пробіли, дефіси.
  const m = text.match(/(\+\d{7,15}|\b\d{3,4}[-\s]?\d{2,3}[-\s]?\d{2,3}[-\s]?\d{2,3}\b)/);
  return m ? m[1] : null;
}

/**
 * Будуємо промпт для мультимовних скрінів (в т.ч. WhatsApp).
 * Ключове: ігнорувати елементи UI та витягати текст незалежно від мови.
 */
function buildPrompt(self: { name?: string; company?: string; email?: string; phone?: string } | null) {
  const me = [
    self?.name ? `Я — ${self.name}` : null,
    self?.company ? `компанія ${self.company}` : null,
    self?.email ? `email: ${self.email}` : null,
    self?.phone ? `телефон: ${self.phone}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  // Строгий контракт + багатомовний витяг:
  return `
${me || "Я — користувач SAM."}

Контекст: на вхід подається СКРІН/ФОТО, часто це скрін WhatsApp або месенджера.
Твоє завдання:
1) ІГНОРУЙ елементи інтерфейсу (кнопки, іконки, хедери, статуси, UI WhatsApp/Android/iOS).
2) ВИТЯГАЙ ТЕКСТ НЕЗАЛЕЖНО ВІД МОВИ (арабська, англійська, українська, російська і т.ін.). 
3) Якщо є дані профілю/контакту — спробуй знайти ім'я, email, телефон, можливу компанію.
4) Якщо є зміст діалогу — визнач, що саме просять/хочуть (бренд, продукт, кількість, одиниці).
5) Якщо чітких даних про компанію немає — не вигадуй: став null.
6) Обовʼязково додай метадані: масив виявлених мов та масив рядків сирого тексту (detected_text).

ПОВЕРНИ СТРОГИЙ JSON рівно у цій формі без пояснень:
{
  "who": {"name": null|string, "email": null|string, "phone": null|string, "source": "email"|"whatsapp"|"other"},
  "company": {"legalName": null|string, "displayName": null|string, "domain": null|string, "country_iso2": null|string},
  "intent": {"brand": null|string, "product": null|string, "quantity": null|number, "unit": null|string, "notes": null|string},
  "meta": {"languages": string[]|null, "detected_text": string[]|null, "confidence": null|number}
}

Правила:
- Якщо це типово виглядає як скрін месенджера (WhatsApp) — поверни "who.source": "whatsapp".
- Телефон слід надавати у міжнародному вигляді, якщо видно код (наприклад, +218...).
- Не додавай полів, яких нема в схемі. Не пиши пояснень, лише JSON.
`;
}

// ---------------- core route ----------------

export async function POST(req: NextRequest) {
  try {
    // 1) Отримуємо multipart form-data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // (Не міняємо твою модельний провайдер/логіку вибору — можна брати з env/headers)
    const provider = (form.get("provider") as LLMProvider) || "openai";
    const model = (form.get("model") as string) || undefined;

    // self дані (щоб LLM знав кого фільтрувати як "я")
    const self = {
      name: (form.get("self_name") as string) || undefined,
      company: (form.get("self_company") as string) || undefined,
      email: (form.get("self_email") as string) || undefined,
      phone: (form.get("self_phone") as string) || undefined,
    };

    // 2) Конвертуємо файл у base64 data URL для vision-моделі (звичний патерн)
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const mime = file.type || "image/jpeg";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    // 3) Готуємо промпт (мультимовний, WhatsApp-friendly)
    const prompt = buildPrompt(self);

    // 4) Викликаємо LLM-витяг
    const llm = await extractInquiry({
      provider,
      model,
      prompt,
      imageDataUrl: dataUrl,
    });

    // Очікуємо JSON у форматі IntakeResult або близький до нього.
    const result: IntakeResult = normalizeResult(llm);

    // 5) Fallback-логіка:
    // 5.1 Джерело: якщо не виставили — ймовірно це WhatsApp-скрін
    if (!result.who?.source) {
      result.who = { ...(result.who || { name: null, email: null, phone: null, source: "other" }), source: "whatsapp" };
    }

    // 5.2 Якщо немає телефону, але є detected_text — пробуємо знайти телефон
    if (!result.who?.phone && result.meta?.detected_text && result.meta.detected_text.length) {
      const phone = extractPhoneFallback(result.meta.detected_text);
      if (phone) {
        result.who = { ...(result.who || { name: null, email: null, phone: null, source: "whatsapp" }), phone };
      }
    }

    // 5.3 Якщо company.legalName відсутній — не фейлимо, повертаємо мінімум (ми потім збережемо через /intake/confirm)
    if (!result.company) {
      result.company = { legalName: null, displayName: null, domain: null, country_iso2: null };
    } else {
      result.company.legalName = result.company.legalName ?? null;
      result.company.displayName = result.company.displayName ?? null;
      result.company.domain = result.company.domain ?? null;
      result.company.country_iso2 = result.company.country_iso2 ?? null;
    }

    // 6) Перестраховуємося по intent
    if (!result.intent) {
      result.intent = { brand: null, product: null, quantity: null, unit: null, notes: null };
    }

    // 7) Повертаємо у стандартизованому вигляді
    return NextResponse.json({ ok: true, data: result }, { status: 200 });
  } catch (err: any) {
    console.error("[intake/image] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}

// ---------------- util: normalize LLM output ----------------

function normalizeResult(raw: any): IntakeResult {
  // Не довіряємо моделі на 100% — жорстко зводимо до потрібної форми.
  const safe = (v: any, fallback: any) => (v === undefined ? fallback : v);

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
    raw: raw,
  };

  try {
    const r = typeof raw === "string" ? JSON.parse(raw) : raw;

    // who
    who.name = safe(r?.who?.name, null);
    who.email = safe(r?.who?.email, null);
    who.phone = safe(r?.who?.phone, null);
    who.source = safe(r?.who?.source, "other");

    // company
    company.legalName = safe(r?.company?.legalName, null);
    company.displayName = safe(r?.company?.displayName, null);
    company.domain = safe(r?.company?.domain, null);
    company.country_iso2 = safe(r?.company?.country_iso2, null);

    // intent
    intent.brand = safe(r?.intent?.brand, null);
    intent.product = safe(r?.intent?.product, null);
    intent.quantity = safeNumber(r?.intent?.quantity);
    intent.unit = safe(r?.intent?.unit, null);
    intent.notes = safe(r?.intent?.notes, null);

    // meta
    meta.languages = Array.isArray(r?.meta?.languages) ? r.meta.languages : [];
    meta.detected_text = Array.isArray(r?.meta?.detected_text) ? r.meta.detected_text : [];
    meta.confidence = safeNumber(r?.meta?.confidence);
  } catch {
    // Якщо взагалі не JSON — залишаємо заготовки й кладемо raw у meta.raw
  }

  return { who, company, intent, meta };
}

function safeNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
