import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

type Decision = { mode: "create"|"merge"|"update"; targetOrgId?: string|null; orgType?: "supplier"|"prospect"|"client" };
type Payload = { normalized: any; decision: Decision };

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Payload;
  const { normalized, decision } = body;
  const sql = getSql();

  // валідація мінімальна
  if (!decision?.mode) return NextResponse.json({ error: "Bad decision" }, { status: 400 });
  if (decision.mode==="create" && !decision.orgType) return NextResponse.json({ error: "orgType required" }, { status: 400 });

  const nameCandidate = normalized.company?.legalName || normalized.company?.displayName || normalized.company?.domain || "Unknown";
  const domain = normalized.company?.domain ?? null;

  let orgId = decision.targetOrgId || null;

  // транзакція
  return await sql.begin(async (tx:any) => {
    if (decision.mode === "create") {
      const rows = await tx/*sql*/`
        insert into organizations
          (name, org_type, country, last_contact_at, created_at, updated_at, general_email, added_at, domain, industry, status, tags, size_tag, source, contact_name, contact_email, contact_phone, note, brand, product, quantity, deal_value_usd)
        values
          (${nameCandidate}, ${decision.orgType}, ${normalized.company?.country ?? null}, null, now(), now(), null, now(),
           ${domain}, null, 'active', null, null, ${normalized.who?.source ?? 'other'}, ${normalized.who?.name ?? null},
           ${normalized.who?.email ?? null}, ${normalized.who?.phone ?? null}, ${normalized.intent?.freeText ?? null},
           ${normalized.intent?.brand ?? null}, ${normalized.intent?.product ?? null}, ${normalized.intent?.quantity ?? null},
           null)
        returning id
      `;
      orgId = rows[0].id;
    } else {
      if (!orgId) return NextResponse.json({ error: "targetOrgId required" }, { status: 400 });
      // легке оновлення контактів / нотаток
      await tx/*sql*/`
        update organizations set
          updated_at = now(),
          contact_name = coalesce(${normalized.who?.name ?? null}, contact_name),
          contact_email = coalesce(${normalized.who?.email ?? null}, contact_email),
          contact_phone = coalesce(${normalized.who?.phone ?? null}, contact_phone),
          note = coalesce(${normalized.intent?.freeText ?? null}, note)
        where id = ${orgId}
      `;
    }

    // створюємо inquiry (summary: коротка збірка, notes: rawText)
    const summaryParts = [
      normalized.intent?.type || null,
      normalized.intent?.brand || null,
      normalized.intent?.product || null,
      normalized.intent?.quantity || null
    ].filter(Boolean);
    const summary = summaryParts.length ? summaryParts.join(" | ") : "New inquiry";

    const insInq = await tx/*sql*/`
      insert into inquiries (org_id, summary, created_at, requested_at, notes, source, updated_at, deleted_at)
      values (${orgId}, ${summary}, now(), null, ${normalized.meta?.rawText ?? null},
              ${normalized.who?.source ?? 'other'}, now(), null)
      returning id
    `;
    const inquiryId = insInq[0].id;

    // опційно, якщо є позиція
    if (normalized.intent?.brand || normalized.intent?.product || normalized.intent?.quantity) {
      const qty = parseFloat(String(normalized.intent?.quantity || "").replace(/[^\d.]/g,"")) || null;
      await tx/*sql*/`
        insert into inquiry_items
          (inquiry_id, brand, product, quantity, unit, unit_price, created_at, quantity_unit, deal_value, currency, notes, updated_at, deleted_at)
        values
          (${inquiryId}, ${normalized.intent?.brand ?? null}, ${normalized.intent?.product ?? null},
           ${qty}, null, null, now(), null, null, null, null, now(), null)
      `;
    }

    return NextResponse.json({ ok: true, organizationId: orgId, inquiryId });
  });
}
