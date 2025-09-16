// app/api/intake/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";

type Decision = {
  mode: "create" | "merge" | "update";
  targetOrgId?: string | null;
  orgType?: "supplier" | "prospect" | "client";
};

type Normalized = {
  who?: { name?: string|null; email?: string|null; phone?: string|null; source?: "email"|"whatsapp"|"other" };
  company?: { legalName?: string|null; displayName?: string|null; domain?: string|null; country?: string|null };
  intent?: { type?: "RFQ"|"Buy"|"Info"|"Support"; brand?: string|null; product?: string|null; quantity?: string|null; freeText?: string|null };
  meta?: { rawText?: string|null; imageUrl?: string|null; confidence?: number|null };
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const normalized: Normalized = body?.normalized ?? {};
  const decision: Decision = body?.decision ?? { mode: "create" };

  if (!decision?.mode) {
    return NextResponse.json({ error: "Bad decision" }, { status: 400 });
  }
  if (decision.mode === "create" && !decision.orgType) {
    return NextResponse.json({ error: "orgType required" }, { status: 400 });
  }
  if ((decision.mode === "merge" || decision.mode === "update") && !decision.targetOrgId) {
    return NextResponse.json({ error: "targetOrgId required" }, { status: 400 });
  }

  const sql = getSql();

  const src = normalized.who?.source ?? "other";
  const companyName =
    normalized.company?.legalName ||
    normalized.company?.displayName ||
    normalized.company?.domain ||
    "Unknown";

  let orgId = decision.targetOrgId ?? null;

  return await sql.begin(async (tx: any) => {
    // 1) Org: create / merge/update
    if (decision.mode === "create") {
      const ins = await tx/*sql*/`
        insert into organizations
          (id, name, org_type, country, last_contact_at, created_at, updated_at,
           general_email, added_at, domain, industry, status, tags, size_tag, source,
           contact_name, contact_email, contact_phone, note, brand, product, quantity, deal_value_usd)
        values
          (gen_random_uuid(), ${companyName}, ${decision.orgType},
           ${normalized.company?.country ?? null}, null, now(), now(),
           null, now(), ${normalized.company?.domain ?? null}, null, 'active', null, null, ${src},
           ${normalized.who?.name ?? null}, ${normalized.who?.email ?? null}, ${normalized.who?.phone ?? null},
           ${normalized.intent?.freeText ?? null}, ${normalized.intent?.brand ?? null},
           ${normalized.intent?.product ?? null}, ${normalized.intent?.quantity ?? null}, null)
        returning id
      `;
      orgId = ins[0].id;
    } else {
      // merge/update — легке доповнення відсутніх полів
      await tx/*sql*/`
        update organizations set
          updated_at = now(),
          contact_name  = coalesce(${normalized.who?.name ?? null}, contact_name),
          contact_email = coalesce(${normalized.who?.email ?? null}, contact_email),
          contact_phone = coalesce(${normalized.who?.phone ?? null}, contact_phone),
          domain        = coalesce(${normalized.company?.domain ?? null}, domain),
          note          = coalesce(${normalized.intent?.freeText ?? null}, note),
          brand         = coalesce(${normalized.intent?.brand ?? null}, brand),
          product       = coalesce(${normalized.intent?.product ?? null}, product),
          quantity      = coalesce(${normalized.intent?.quantity ?? null}, quantity)
        where id = ${orgId}
      `;
    }

    // 2) Inquiry
    const summaryParts = [
      normalized.intent?.type,
      normalized.intent?.brand,
      normalized.intent?.product,
      normalized.intent?.quantity,
    ].filter(Boolean);
    const summary = summaryParts.length ? summaryParts.join(" | ") : "New inquiry";

    const insInq = await tx/*sql*/`
      insert into inquiries
        (id, org_id, summary, created_at, requested_at, notes, source, updated_at, deleted_at)
      values
        (gen_random_uuid(), ${orgId}, ${summary}, now(), null, ${normalized.meta?.rawText ?? null},
         ${src}, now(), null)
      returning id
    `;
    const inquiryId = insInq[0].id;

    // 3) Inquiry item (якщо є дані)
    const hasItem = Boolean(
      normalized.intent?.brand || normalized.intent?.product || normalized.intent?.quantity
    );
    if (hasItem) {
      const qtyNum =
        normalized.intent?.quantity
          ? Number(String(normalized.intent.quantity).replace(/[^0-9.,]/g, "").replace(",", "."))
          : null;

      await tx/*sql*/`
        insert into inquiry_items
          (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at,
           quantity_unit, deal_value, currency, notes, updated_at, deleted_at)
        values
          (gen_random_uuid(), ${inquiryId}, ${normalized.intent?.brand ?? null},
           ${normalized.intent?.product ?? null}, ${qtyNum}, null, null, now(),
           null, null, null, null, now(), null)
      `;
    }

    return NextResponse.json({ ok: true, organizationId: orgId, inquiryId });
  });
}
