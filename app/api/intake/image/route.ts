import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// === Опційний OCR: підключи свою реалізацію або заглушку
async function runOCR(buf: Buffer): Promise<string> {
  // TODO: якщо треба — підключи tesseract; поки повернемо пусто
  return "";
}

// === Заглушка LLM-парсингу: ти підключиш свій /lib/llm пізніше
async function parseInquiry({ imageUrl, rawText }:{ imageUrl:string; rawText:string }) {
  // Тут має бути виклик vision LLM і парсинг у JSON.
  // Тимчасово: повернемо мінімальний об'єкт, щоб флоу працював.
  return {
    who: { name: null, email: null, phone: null, source: "other" as const },
    company: { legalName: null, displayName: null, domain: null, country: null },
    intent: { type: "Info" as const, brand: null, product: null, quantity: null, freeText: rawText || null },
    meta: { confidence: 0.5, rawText, imageUrl }
  };
}

// Простий дедуп: шукаємо організації за domain або email у contact_email (спрощено)
import { getSql } from "@/lib/db"; // очікується, що в тебе є getSql() → neon sql

async function dedupeCandidates({ domain, email }:{ domain?:string|null; email?:string|null }) {
  const sql = getSql();
  const out: any[] = [];
  if (domain) {
    const rows = await sql/*sql*/`
      select id, name, domain, 'domain_exact' as match_type
      from organizations where lower(domain)=lower(${domain})
      limit 5
    `;
    out.push(...rows);
  }
  if (email) {
    const rows = await sql/*sql*/`
      select id, name, domain, 'via_email' as match_type
      from organizations where lower(contact_email)=lower(${email})
      limit 5
    `;
    out.push(...rows);
  }
  return out;
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // читаємо буфер
  const ab = await file.arrayBuffer();
  const src = Buffer.from(ab);

  // міні-передобробка: grayscale + resize, як просив
  const processed = await sharp(src).resize(2000, 2000, { fit: "inside" }).grayscale().toBuffer();

  // OCR (за бажанням; можна лишити порожнім)
  const rawText = await runOCR(processed);

  // Уявний URL (ми не зберігаємо файл; якщо треба — підключи blob/S3 і передай URL)
  const imageUrl = `data:${file.type};base64,${processed.toString("base64").slice(0,64)}...`;

  // LLM-парсинг
  const parsed = await parseInquiry({ imageUrl, rawText });

  // Normalize (мінімально): domain → lower, email → lower
  parsed.company.domain = parsed.company.domain?.toLowerCase() ?? null;
  parsed.who.email = parsed.who.email?.toLowerCase() ?? null;

  // Дедуп кандидати
  const candidates = await dedupeCandidates({ domain: parsed.company.domain, email: parsed.who.email ?? undefined });

  return NextResponse.json({ normalized: parsed, dedupe: { candidates } });
}
