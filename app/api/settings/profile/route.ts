export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// ——— м’які валідації/нормалізації (мінімум)
function norm(v?: string | null) { return (v ?? "").trim(); }
function normLower(v?: string | null) { return (v ?? "").trim().toLowerCase(); }
function normPhone(v?: string | null) { return (v ?? "").replace(/[^0-9+]/g, ""); }
function normDomain(v?: string | null) {
  let s = (v ?? "").trim().toLowerCase();
  if (!s) return "";
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) s = new URL(s).hostname;
  } catch {}
  return s.replace(/^www\./, "");
}

type PutBody = {
  contact_name?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_domain?: string;
  company_country?: string;
};

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  try {
    const rows = await sql/*sql*/`
      select
        contact_name,
        company_name,
        company_email,
        company_phone,
        company_domain,
        company_country
      from tenant_settings
      where tenant_id = ${tenantId}
      limit 1
    `;
    const r = rows[0] || {};
    return NextResponse.json({ profile: {
      contact_name: r.contact_name ?? "",
      company_name: r.company_name ?? "",
      company_email: r.company_email ?? "",
      company_phone: r.company_phone ?? "",
      company_domain: r.company_domain ?? "",
      company_country: r.company_country ?? "",
    }});
  } catch (e:any) {
    console.error("GET /api/settings/profile error:", e);
    return NextResponse.json({ profile: {} });
  }
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    // тимчасовий явний меседж — якщо у сесії нема tenant’а
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  let body: PutBody = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact_name   = norm(body.contact_name);
  const company_name   = norm(body.company_name);
  const company_email  = normLower(body.company_email);
  const company_phone  = normPhone(body.company_phone);
  const company_domain = normDomain(body.company_domain);
  const company_country= norm(body.company_country);

  try {
    // ВАЖЛИВО: тільки прості колонки. Жодних jsonb тут.
    await sql/*sql*/`
      insert into tenant_settings (
        tenant_id,
        contact_name,
        company_name,
        company_email,
        company_phone,
        company_domain,
        company_country,
        created_at,
        updated_at
      )
      values (
        ${tenantId},
        ${contact_name},
        ${company_name},
        ${company_email},
        ${company_phone},
        ${company_domain},
        ${company_country},
        now(), now()
      )
      on conflict (tenant_id) do update set
        contact_name    = excluded.contact_name,
        company_name    = excluded.company_name,
        company_email   = excluded.company_email,
        company_phone   = excluded.company_phone,
        company_domain  = excluded.company_domain,
        company_country = excluded.company_country,
        updated_at      = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (e:any) {
    console.error("PUT /api/settings/profile UPSERT error:", e?.message || e);
    // кидаємо сире повідомлення БД — щоб ти бачив справжню причину в UI
    return NextResponse.json({ error: "DB upsert failed: " + (e?.message || String(e)) }, { status: 500 });
  }
}

// POST як синонім PUT
export async function POST(req: Request) {
  return PUT(req);
}
