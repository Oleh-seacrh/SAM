// app/api/intake/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractInquiry, LLMProvider } from "@/lib/llm";

export const runtime = "nodejs";
// На випадок динамічних форм/великих файлів
export const dynamic = "force-dynamic";

/* ---------- helpers ---------- */
function buildPrompt(self: any, rawText: string, imageUrlForLLM: string) {
  const me = [
    self?.name ? `Я — ${self.name}` : null,
    self?.company ? `компанія ${self.company}` : null,
    self?.email ? `email: ${self.email}` : null,
    self?.phone ? `телефон: ${self.phone}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `
${me || "Я — користувач SAM."}
Мета: визначити хто написав (не я) і що хоче. Поверни строгий JSON:
{
  "who": {"name": null|string, "email": null|string, "phone": null|string, "source": "email"|"whatsapp"|"other"},
  "company": {"legalName": null|string, "displayName": null|string, "domain": null|string, "country": null|string},
  "intent": {"type": "RFQ"|"Buy"|"Info"|"Support", "brand": null|string, "product": null|string, "quantity": null|string, "freeText": null|string}
}
Image: ${imageUrlForLLM}
Text: """${rawText || ""}"""
Якщо бачиш мої власні контакти/домен (${self?.domain ?? "—"}) — не плутай їх із відправником.
  `.trim();
}

async function runOCR(_buf: Buffer): Promise<string> {
  // За потреби підключиш реальний OCR (Tesseract/Google Vision/Blade)
  return "";
}

async function dedupeCandidates({
  domain,
  email,
}: {
  domain?: string | null;
  email?: string | null;
}) {
  const sql = getSql();
  const out: any[] = [];
  if (domain) {
    const rows = await sql/*sql*/`
      select id, name, domain, 'domain_exact' as match_type
      from organizations
      where lower(domain) = lower(${domain})
      limit 5
    `;
    out.push(...rows);
  }
  if (email) {
    const rows = await sql/*sql*/`
      select id, name, domain, 'via_email' as match_type
      from organizations
      where lower(contact_email) = lower(${email})
      limit 5
    `;
    out.push(...rows);
  }
  return out;
}

type PreparedImage = {
  mime: string;           // наприклад "image/webp"
  fullForLLM: string;     // data URL для Vision
  tinyPreview: string;    // маленький прев’ю (для UI), ~320px по більшій стороні
};

async function prepareImage(src: Buffer, mimeFallback = "image/png"): Promise<PreparedImage> {
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? mod;

    // 1) основне зображення для Vision (розумний розмір + ч/б часто краще читається)
    const processed = await sharp(src)
      .rotate() // авто-EXIF
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .webp({ effort: 4, quality: 82 })
      .toBuffer();

    // 2) маленький прев’ю для UI (не віддаємо гігантські base64 в JSON)
    const tiny = await sharp(src)
      .rotate()
      .resize(320, 320, { fit: "inside", withoutEnlargement: true })
      .webp({ effort: 4, quality: 70 })
      .toBuffer();

    return {
      mime: "image/webp",
      fullForLLM: `data:image/webp;base64,${processed.toString("base64")}`,
      tinyPreview: `data:image/webp;base64,${tiny.toString("base64")}`,
    };
  } catch {
    // Без sharp — віддаємо як є (обережно з розміром)
    const mime = mimeFallback || "image/png";
    const base64 = src.toString("base64");
    return {
      mime,
      fullForLLM: `data:${mime};base64,${base64}`,
      tinyPreview: `data:${mime};base64,${base64}`,
    };
  }
}

/* ---------- handler ---------- */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json({ error: "Bad multipart/form-data" }, { status: 400 });
  }

  // Підтримуємо і "file", і "image"
  const file = (form.get("file") || form.get("image")) as File | null;
  const selfRaw = form.get("self_json") as string | null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Легкий sanity-check
  const fileType = file.type || "image/png";
  if (!fileType.startsWith("image/")) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  // Парсимо self
  const self = (() => {
    try {
      return selfRaw ? JSON.parse(selfRaw) : {};
    } catch {
      return {};
    }
  })();

  // Читаємо/нормалізуємо картинку
  const ab = await file.arrayBuffer();
  const src = Buffer.from(ab);

  // Якщо дуже великий файл — не ламаємось, просто стискаємо
  const { fullForLLM, tinyPreview } = await prepareImage(src, fileType);

  // OCR (опційно)
  const rawText = await runOCR(src);

  // Провайдер/модель
  const provider = ((process.env.SAM_LLM_PROVIDER || "openai").toLowerCase() as LLMProvider);
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Промпт під Vision
  const prompt = buildPrompt(self, rawText, fullForLLM);

  // Виклик LLM з guard’ами
  let extracted: any;
  try {
    // Даємо таймаут, але НЕ передаємо сторонні поля у extractInquiry,
    // якщо твій wrapper їх не очікує.
    const timeoutMs = Number(process.env.SAM_VISION_TIMEOUT_MS ?? 15000);
    const withTimeout = <T>(p: Promise<T>) =>
      Promise.race<T>([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), timeoutMs)),
      ]);

    extracted = await withTimeout(
      extractInquiry({
        provider,
        model,
        prompt,
        imageDataUrl: fullForLLM, // твій wrapper вже вміє з data URL
      } as any)
    );
  } catch (e: any) {
    console.error("extractInquiry failed:", e?.message || e);
    // Фолбек — мінімально валідна структура
    extracted = {
      who:       { name: null, email: null, phone: null, source: "other" as const },
      company:   { legalName: null, displayName: null, domain: null, country: null },
      intent:    { type: "Info" as const, brand: null, product: null, quantity: null, freeText: null },
    };
  }

  // Приводимо + метадані
  const parsed = {
    who: extracted.who,
    company: extracted.company,
    intent: extracted.intent,
    meta: {
      confidence: typeof extracted?.meta?.confidence === "number" ? extracted.meta.confidence : 0.75,
      rawText: rawText || null,
      // ❗ Не віддаємо великий base64 назад. Лише маленьке прев’ю для UI.
      imageThumbUrl: tinyPreview,
    },
  };

  // Нормалізація + захист від "моїх" адрес
  parsed.company.domain = parsed.company.domain?.toLowerCase() ?? null;
  parsed.who.email = parsed.who.email?.toLowerCase() ?? null;

  if (self?.domain && parsed.who.email?.endsWith(`@${String(self.domain).toLowerCase()}`)) {
    parsed.who.email = null;
  }

  // Дедуп
  const candidates = await dedupeCandidates({
    domain: parsed.company.domain,
    email: parsed.who.email ?? undefined,
  });

  return NextResponse.json({ normalized: parsed, dedupe: { candidates } });
}
