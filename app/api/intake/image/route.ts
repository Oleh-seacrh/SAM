// app/api/intake/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractInquiry, LLMProvider } from "@/lib/llm";

export const runtime = "nodejs";

/* ---------- helpers ---------- */
function buildPrompt(self: any, rawText: string, imageUrl: string) {
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
Image: ${imageUrl}
Text: """${rawText || ""}"""
Якщо бачиш мої власні контакти/домен (${self?.domain ?? "—"}) — не плутай їх із відправником.
  `.trim();
}

async function runOCR(_buf: Buffer): Promise<string> {
  return ""; // підключиш OCR або лишай порожнім, якщо Vision достатньо
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

async function maybeProcessImage(src: Buffer): Promise<Buffer> {
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? mod;
    return await sharp(src).resize(2000, 2000, { fit: "inside" }).grayscale().toBuffer();
  } catch {
    return src; // без sharp працює як є
  }
}

/* ---------- handler ---------- */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const selfRaw = form.get("self_json") as string | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const self = (() => {
    try {
      return selfRaw ? JSON.parse(selfRaw) : {};
    } catch {
      return {};
    }
  })();

  const ab = await file.arrayBuffer();
  const src = Buffer.from(ab);
  const processed = await maybeProcessImage(src);
  const rawText = await runOCR(processed);

    // повний data URL (важливо для vision)
  const imageDataUrl = `data:${file.type || "image/png"};base64,${processed.toString("base64")}`;

  // оголошуємо provider ДО використання
  const provider = ((process.env.SAM_LLM_PROVIDER || "openai").toLowerCase() as LLMProvider);
  const prompt = buildPrompt(self, rawText, imageDataUrl);

  // ✅ SAFE: реальний виклик LLM з дефолтною моделлю і фолбеком
  let extracted: any;
  try {
    // опціональний таймаут, щоб не підвисати назавжди
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000); // 15s
    try {
      extracted = await extractInquiry({
        provider,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini", // дефолт, якщо не задано
        prompt,
        imageDataUrl,
        signal: (ctrl as any).signal, // якщо твій extractInquiry підтримує signal
      } as any);
    } finally {
      clearTimeout(t);
    }
  } catch (e: any) {
    console.error("extractInquiry failed:", e?.message || e);
    // Фолбек без LLM — повертаємо мінімально валідні поля, щоб UI жив
    extracted = {
      who:       { name: null, email: null, phone: null, source: "other" as const },
      company:   { legalName: null, displayName: null, domain: null, country: null },
      intent:    { type: "Info" as const, brand: null, product: null, quantity: null, freeText: null },
    };
  }

  // приводимо до єдиного формату + мета
  const parsed = {
    who: extracted.who,
    company: extracted.company,
    intent: extracted.intent,
    meta: { confidence: 0.75, rawText, imageUrl: imageDataUrl },
  };

  // нормалізація та захист від "моїх" адрес
  parsed.company.domain = parsed.company.domain?.toLowerCase() ?? null;
  parsed.who.email = parsed.who.email?.toLowerCase() ?? null;
  if (self?.domain && parsed.who.email?.endsWith(`@${String(self.domain).toLowerCase()}`)) {
    parsed.who.email = null;
  }

  const candidates = await dedupeCandidates({
    domain: parsed.company.domain,
    email: parsed.who.email ?? undefined,
  });

  return NextResponse.json({ normalized: parsed, dedupe: { candidates } });
  }
