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

/* ---------- helpers: qty/unit + compact summary ---------- */
function parseQtyUnit(raw?: string | null): { qtyNum: number | null; unit: string | null; qtyText: string | null } {
  if (!raw) return { qtyNum: null, unit: null, qtyText: null };
  const s = String(raw).trim();
  const m = s.match(/([\d.,]+)/);
  let qtyNum: number | null = null;
  if (m) {
    qtyNum = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(qtyNum)) qtyNum = null;
  }
  const unit = s.replace(/[\d.,\s]+/g, "").trim() || null;
  return { qtyNum, unit, qtyText: s };
}
function shortWords(s?: string | null, maxWords = 4): string | null {
  if (!s) return null;
  const w = s.replace(/\s+/g, " ").trim().split(" ");
  return w.slice(0, maxWords).join(" ");
}
function compactSummary(n: Normalized): string {
  const t = n.intent?.type || "Inquiry";
  const br = shortWords(n.intent?.brand, 2);
  const pr = shortWords(n.intent?.product, 4);
  const { qtyNum, unit } = parseQtyUnit(n.intent?.quantity);
  let s = [t, br, pr, qtyNum ? `${qtyNum}${unit ? " " + unit : ""}` : null].filter(Boolean).join(" | ");
  if (s.length > 90) s = s.slice(0, 87) + "…";
  return s;
}

/* ---------- handler ---------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const normalized: Normalized = body?.normalized ?? {};
    const decision: Decision = body?.decision ?? { mode: "create" };

    // validate
    if (!decision?.mode) return NextResponse.json({ error: "Bad decision" }, { status: 400 });
    if (decision.mode === "create" && !decision.orgType)
      return NextResponse.json({ error: "orgType required" }, { status: 400 });
    if ((decision.mode === "merge" || decision.mode === "update") && !decision.targetOrgId)
      return NextResponse.json({ error: "targetOrgId required" }, { status: 400 });

    const sql = getSql();

    const src = normalized.who?.source ?? "other";
    const companyName =
      normalized.company?.legalName ||
      normalized.company?.displayName ||
      normalized.company?.domain ||
      "Unknown";

    const normEmail = normalized.who?.email ? String(normalized.who.email).toLowerCase() : null;
    const normDomain = normalized.company?.domain ? String(normalized.company.domain).toLowerCase() : null;

    let orgId = decision.targetOrgId ?? null;

    await sql`BEGIN`;
    try {
      // 1) organizations
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

      // 2) inquiries (requested_at is NOT NULL)
      const summary = compactSummary(normalized);
      const inquiryId = randomUUID();
      await sql/*sql*/`
        insert into inquiries
          (id, org_id, summary, created_at, requested_at, notes, source, updated_at, deleted_at)
        values
          (${inquiryId}, ${orgId}, ${summary}, now(), now(), ${normalized.meta?.rawText ?? null},
           ${src}, now(), null)
      `;

      // 3) inquiry_items (optional)
      const hasItem = Boolean(normalized.intent?.brand || normalized.intent?.product || normalized.intent?.quantity);
      if (hasItem) {
        const itemId = randomUUID();
        const { qtyText, unit } = parseQtyUnit(normalized.intent?.quantity);
        await sql/*sql*/`
          insert into inquiry_items
            (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at,
             quantity_unit, deal_value, currency, notes, updated_at, deleted_at)
          values
            (${itemId}, ${inquiryId}, ${normalized.intent?.brand ?? null},
             ${normalized.intent?.product ?? null}, ${qtyText}, ${unit}, null, now(),
             ${unit}, null, null, null, now(), null)
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
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
