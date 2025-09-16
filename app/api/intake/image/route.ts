import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractInquiry, LLMProvider } from "@/lib/llm";
export const runtime = "nodejs";

// ---- промпт-білдер
function buildPrompt(self: any, rawText: string, imageUrl: string) {
  const me = [
    self?.name ? `Я — ${self.name}` : null,
    self?.company ? `компанія ${self.company}` : null,
    self?.email ? `email: ${self.email}` : null,
    self?.phone ? `телефон: ${self.phone}` : null
  ].filter(Boolean).join(", ");

  return `
${me || "Я — користувач системи SAM."}
Мета: зрозуміти хто написав повідомлення (це не я) і чого він хоче, та повернути структурований JSON.
Якщо в тексті/зображенні зустрічаються мої власні контакти/домен (${self?.domain ?? "—"}), не плутай їх з контактами відправника.

Image: ${imageUrl}
Text (OCR): """${rawText || ""}"""

Відповідай ТІЛЬКИ валідним JSON:
{
  "who": { "name": null|string, "email": null|string, "phone": null|string, "source": "email"|"whatsapp"|"other" },
  "company": { "legalName": null|string, "displayName": null|string, "domain": null|string, "country": null|string },
  "intent": { "type": "RFQ"|"Buy"|"Info"|"Support", "brand": null|string, "product": null|string, "quantity": null|string, "freeText": null|string }
}
  `.trim();
}

// ---- OCR-заглушка
async function runOCR(_buf: Buffer): Promise<string> { return ""; }

// ---- LLM-парсинг (поки заглушка, але вже отримує self і готовий prompt)
async function parseInquiryReal({ imageDataUrl, rawText, self }:{
  imageDataUrl: string; rawText: string; self:any
}) {
  const prompt = buildPrompt(self, rawText, imageDataUrl);
  const json = await extractInquiry({ provider, model: process.env.OPENAI_MODEL, prompt, imageDataUrl });
  const provider = (process.env.SAM_LLM_PROVIDER || "openai").toLowerCase() as LLMProvider;
  let json: any;
  if (provider === "OPENAI") {
    json = await extractInquiryViaOpenAI({ prompt, imageDataUrl });
  } else {
    throw new Error(`Provider ${provider} not implemented`);
  }
  return {
    who: { name: json?.who?.name ?? null, email: json?.who?.email ?? null, phone: json?.who?.phone ?? null, source: json?.who?.source ?? "other" },
    company: { legalName: json?.company?.legalName ?? null, displayName: json?.company?.displayName ?? null, domain: json?.company?.domain ?? null, country: json?.company?.country ?? null },
    intent: { type: json?.intent?.type ?? "Info", brand: json?.intent?.brand ?? null, product: json?.intent?.product ?? null, quantity: json?.intent?.quantity ?? null, freeText: json?.intent?.freeText ?? null },
    meta: { confidence: 0.75, rawText, imageUrl: imageDataUrl }
  };
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const selfRaw = form.get("self_json") as string | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const self = (() => { try { return selfRaw ? JSON.parse(selfRaw) : {}; } catch { return {}; } })();

  const ab = await file.arrayBuffer();
  const src = Buffer.from(ab);
  const processed = await maybeProcessImage(src);     // <-- твоя існуюча функція
  const rawText = await runOCR(processed);           // <-- поки порожньо або по OCR

  // ВАЖЛИВО: тепер передаємо **повний** data URL (без обрізання!)
  const base64 = processed.toString("base64");
  const imageDataUrl = `data:${file.type};base64,${base64}`;

  const parsed = await parseInquiryReal({ imageDataUrl, rawText, self });

  // нормалізація + захист від "моїх" контактів
  parsed.company.domain = parsed.company.domain?.toLowerCase() ?? null;
  parsed.who.email = parsed.who.email?.toLowerCase() ?? null;
  if (self?.domain && parsed.who?.email?.endsWith(`@${String(self.domain).toLowerCase()}`)) {
    parsed.who.email = null;
  }

  const candidates = await dedupeCandidates({ domain: parsed.company.domain, email: parsed.who.email ?? undefined });
  return NextResponse.json({ normalized: parsed, dedupe: { candidates } });
}

// ---- простий дедуп
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

// ---- optional: dynamic sharp
async function maybeProcessImage(src: Buffer): Promise<Buffer> {
  try {
    const mod = await import("sharp");
    const sharp = (mod as any).default ?? mod;
    return await sharp(src).resize(2000, 2000, { fit: "inside" }).grayscale().toBuffer();
  } catch { return src; }
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const selfRaw = form.get("self_json") as string | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const self = (() => { try { return selfRaw ? JSON.parse(selfRaw) : {}; } catch { return {}; } })();

  const ab = await file.arrayBuffer();
  const src = Buffer.from(ab);
  const processed = await maybeProcessImage(src);
  const rawText = await runOCR(processed);

  const imageUrl = `data:${file.type};base64,${processed.toString("base64").slice(0,64)}...`;

  const parsed = await parseInquiry({ imageUrl, rawText, self });

  // нормалізація + захист від "моїх" контактів
  parsed.company.domain = parsed.company.domain?.toLowerCase() ?? null;
  parsed.who.email = parsed.who.email?.toLowerCase() ?? null;
  if (self?.domain && parsed.who?.email?.endsWith(`@${String(self.domain).toLowerCase()}`)) {
    // якщо LLM випадково взяв твою адресу як відправника — занулимо
    parsed.who.email = null;
  }

  const candidates = await dedupeCandidates({ domain: parsed.company.domain, email: parsed.who.email ?? undefined });

  return NextResponse.json({ normalized: parsed, dedupe: { candidates } });
}
