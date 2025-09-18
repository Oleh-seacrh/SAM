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
  company?: {
    legalName?: string | null; displayName?: string | null; domain?: string | null; country?: string | null;
    linkedin_url?: string | null; facebook_url?: string | null; // <-- опціонально від LLM
  };
  intent?: { type?: "RFQ" | "Buy" | "Info" | "Support"; brand?: string | null; product?: string | null; quantity?: string | null; freeText?: string | null };
  meta?: { rawText?: string | null; imageUrl?: string | null; confidence?: number | null };
};

// ---- helpers: qty/unit + compact summary + url sanitize ----
function parseQtyUnit(raw?: string | null): { qtyNum: number | null; unit: string | null } {
  if (!raw) return { qtyNum: null, unit: null };
  const s = String(raw).trim();
  const m = s.match(/([\d.,]+)/);
  let qtyNum: number | null = null;
  if (m) {
    qtyNum = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isNaN(qtyNum)) qtyNum = null;
  }
  const unit = s.replace(/[\d.,\s]+/g, "").trim() || null;
  return { qtyNum, unit };
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
function cleanSocialUrl(u?: any, hostEndsWith?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(String(u));
    if (hostEndsWith && !url.hostname.toLowerCase().endsWith(hostEndsWith)) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

/* ---------- handler ---------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const normalized: Normalized = body?.normalized ?? {};
    const decision: Decision = body?.decision ?? { mode: "create" };
    const socialsIn = body?.socials ?? {}; // { linkedin_url?, facebook_url? } з фронта

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

    // соцпосилання беремо: пріоритет фронт → якщо пусто, спроба з normalized.company
    const linkedinUrl = cleanSocialUrl(
      socialsIn.linkedin_url ?? normalized.company?.linkedin_url,
      "linkedin.com"
    );
    const facebookUrl = cleanSocialUrl(
      socialsIn.facebook_url ?? normalized.company?.facebook_url,
      "facebook.com"
    );

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
             contact_name, contact_email, contact_phone, note, brand, product, quantity, deal_value_usd,
             linkedin_url, facebook_url)
          values
            (${newOrgId}, ${companyName}, ${decision.orgType},
             ${normalized.company?.country ?? null}, null, now(), now(),
             null, now(), ${normDomain}, null, 'active', null, null, ${src},
             ${normalized.who?.name ?? null}, ${normEmail}, ${normalized.who?.phone ?? null},
             ${normalized.intent?.freeText ?? null}, ${normalized.intent?.brand ?? null},
             ${normalized.intent?.product ?? null}, ${normalized.intent?.quantity ?? null}, null,
             ${linkedinUrl}, ${facebookUrl})
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
            quantity      = coalesce(${normalized.intent?.quantity ?? null}, quantity),
            linkedin_url  = coalesce(${linkedinUrl}, linkedin_url),
            facebook_url  = coalesce(${facebookUrl}, facebook_url)
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

      // 3) inquiry_items (створюємо, якщо є хоч щось осмислене)
      const brandVal   = (normalized.intent?.brand || "").trim();
      const productVal = (normalized.intent?.product || "").trim();
      const qtyRaw     = (normalized.intent?.quantity || "").trim();
      const { qtyNum, unit } = parseQtyUnit(qtyRaw);

      const shouldCreateItem = Boolean(productVal || brandVal || qtyNum !== null);

      let itemsInserted = 0;
      let itemSnapshot: any = null;

      if (shouldCreateItem) {
        const itemId = randomUUID();
        await sql/*sql*/`
          insert into inquiry_items
            (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at,
             quantity_unit, deal_value, currency, notes, updated_at, deleted_at)
          values
            (${itemId}, ${inquiryId}, ${brandVal || null},
             ${productVal || null}, ${qtyNum}, ${unit || null}, null, now(),
             ${unit || null}, null, null, null, now(), null)
        `;
        itemsInserted = 1;
        itemSnapshot = { brand: brandVal || null, product: productVal || null, quantity: qtyNum, unit: unit || null };
      }

      await sql`COMMIT`;
      return NextResponse.json({
        ok: true, organizationId: orgId, inquiryId,
        socials: { linkedin_url: linkedinUrl, facebook_url: facebookUrl },
        itemsInserted, itemSnapshot
      });
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }
  } catch (err: any) {
    console.error("INTAKE CONFIRM ERROR:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
