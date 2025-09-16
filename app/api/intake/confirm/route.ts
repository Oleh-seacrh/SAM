// app/api/intake/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type Decision = {
  mode: "create" | "merge" | "update";
  targetOrgId?: string | null;
  orgType?: "supplier" | "prospect" | "client";
};

type Normalized = {
  who?: { name?: string | null; email?: string | null; phone?: string | null; source?: "email" | "whatsapp" | "other" };
  company?: { legalName?: string | null; displayName?: string | null; domain?: string | null; country?: string | null };
  intent?: { type?: "RFQ" | "Buy" | "Info" | "Support"; brand?: string | null; product?: string | null; quantity?: string | null; freeText?: string | null };
  meta?: { rawText?: string | null; imageUrl?: string | null; confidence?: number | null };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const normalized: Normalized = body?.normalized ?? {};
    const decision: Decision = body?.decision ?? { mode: "create" };

    // Валідація рішень
    if (!decision?.mode) return NextResponse.json({ error: "Bad decision" }, { status: 400 });
    if (decision.mode === "create" && !decision.orgType) {
      return NextResponse.json({ error: "orgType required" }, { status: 400 });
    }
    if ((decision.mode === "merge" || decision.mode === "update") && !decision.targetOrgId) {
      return NextResponse.json({ error: "targetOrgId required" }, { status: 400 });
    }

    const sql = getSql();

    // Похідні значення
    const src = normalized.who?.source ?? "other";
    const companyName =
      normalized.company?.legalName ||
      normalized.company?.displayName ||
      normalized.company?.domain ||
      "Unknown";

    // нормалізуємо e-mail/domain до lower (щоб співпадати з індексами/дедупом)
    const normEmail = normalized.who?.email ? String(normalized.who.email).toLowerCase() : null;
    const normDomain = normalized.company?.domain ? String(normalized.company.domain).toLowerCase() : null;

    let orgId = decision.targetOrgId ?? null;

    // ---- Транзакція (Neon serverless без .begin()) ----
    await sql`BEGIN`;
    try {
      // 1) Organizations: create / merge-update
      if (decision.mode === "create") {
        const newOrgId = randomUUID();
        await sql/*sql*/`
          insert into organizations
            (id, name, org_type, country, last_contact_at, created_at, updated_at,
             general_email, added_at, domain, industry, status, tags, size_tag, source,
             contact_name, contact_email, contact_phone, note, brand, product, quantity, deal_value_usd)
          values
            (${newOrgId}, ${companyName}, ${decision.orgType},
             ${normalized.company?.country ?? null}, null, now(), now(),
             null, now(), ${normDomain}, null, 'active', null, null, ${src},
             ${normalized.who?.name ?? null}, ${normEmail}, ${normalized.who?.phone ?? null},
             ${normalized.intent?.freeText ?? null}, ${normalized.intent?.brand ?? null},
             ${normalized.intent?.product ?? null}, ${normalized.intent?.quantity ?? null}, null)
        `;
        orgId = newOrgId;
      } else {
        await sql/*sql*/`
          update organizations set
            updated_at    = now(),
            contact_name  = coalesce(${normalized.who?.name ?? null}, contact_name),
            contact_email = coalesce(${normEmail}, contact_email),
            contact_phone = coalesce(${normalized.who?.phone ?? null}, contact_phone),
            domain        = coalesce(${normDomain}, domain),
            note          = coalesce(${normalized.intent?.freeText ?? null}, note),
            brand         = coalesce(${normalized.intent?.brand ?? null}, brand),
            product       = coalesce(${normalized.intent?.product ?? null}, product),
            quantity      = coalesce(${normalized.intent?.quantity ?? null}, quantity)
          where id = ${orgId}
        `;
      }

      // 2) Inquiries: requested_at має NOT NULL → ставимо now()
      const summaryParts = [
        normalized.intent?.type,
        normalized.intent?.brand,
        normalized.intent?.product,
        normalized.intent?.quantity,
      ].filter(Boolean);
      const summary = summaryParts.length ? summaryParts.join(" | ") : "New inquiry";

      const inquiryId = randomUUID();
      await sql/*sql*/`
        insert into inquiries
          (id, org_id, summary, created_at, requested_at, notes, source, updated_at, deleted_at)
        values
          (${inquiryId}, ${orgId}, ${summary}, now(), now(), ${normalized.meta?.rawText ?? null},
           ${src}, now(), null)
      `;

      // 3) Inquiry item (опційно — якщо є хоч щось із трійки)
      const hasItem = Boolean(
        normalized.intent?.brand || normalized.intent?.product || normalized.intent?.quantity
      );
      if (hasItem) {
        const itemId = randomUUID();
        const qtyText = normalized.intent?.quantity ?? null; // як text — безпечніше під будь-який тип
        await sql/*sql*/`
          insert into inquiry_items
            (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at,
             quantity_unit, deal_value, currency, notes, updated_at, deleted_at)
          values
            (${itemId}, ${inquiryId}, ${normalized.intent?.brand ?? null},
             ${normalized.intent?.product ?? null}, ${qtyText}, null, null, now(),
             null, null, null, null, now(), null)
        `;
      }

      await sql`COMMIT`;
      return NextResponse.json({ ok: true, organizationId: orgId, inquiryId });
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }
  } catch (err: any) {
    console.error("INTAKE CONFIRM ERROR:", err?.message || err);
    // повертаємо текст помилки, щоб було видно в Network
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
