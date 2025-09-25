export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// Дуже м’які нормалізації, без фанатизму
function normStr(v: unknown) { return (typeof v === "string" ? v.trim() : ""); }
function normEmail(v: unknown) {
  const s = normStr(v).toLowerCase();
  return s && s.includes("@") && s.includes(".") ? s : "";
}
function normPhone(v: unknown) {
  const s = normStr(v).replace(/[^0-9+]/g, "");
  return s; // приймаємо будь-який "цифри та +"
}
function normDomain(raw: unknown) {
  let s = normStr(raw).toLowerCase();
  if (!s) return "";
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) s = new URL(s).hostname;
  } catch {}
  s = s.replace(/^www\./, "");
  return s;
}

type Body = {
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
    const profile = {
      contact_name:    r.contact_name    ?? "",
      company_name:    r.company_name    ?? "",
      company_email:   r.company_email   ?? "",
      company_phone:   r.company_phone   ?? "",
      company_domain:  r.company_domain  ?? "",
      company_country: r.company_country ?? "",
    };

    return NextResponse.json({ profile });
  } catch (e: any) {
    console.error("GET /api/settings/profile error", e);
    // Повертаємо порожній профіль, але без 500 — хай UI просто показує пусто
    return NextResponse.json({ profile: {
      contact_name: "", company_name: "", company_email: "",
      company_phone: "", company_domain: "", company_country: ""
    }});
  }
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact_name    = normStr(body.contact_name);
  const company_name    = normStr(body.company_name);
  const company_email   = normEmail(body.company_email);
  const company_phone   = normPhone(body.company_phone);
  const company_domain  = normDomain(body.company_domain);
  const company_country = normStr(body.company_country);

  try {
    await sql/*sql*/`
      insert into tenant_settings (
        tenant_id,
        contact_name, company_name, company_email, company_phone, company_domain, company_country
      ) values (
        ${tenantId},
        ${contact_name}, ${company_name}, ${company_email}, ${company_phone}, ${company_domain}, ${company_country}
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
  } catch (e: any) {
    console.error("PUT /api/settings/profile error", e);
    return NextResponse.json({ error: "DB upsert failed" }, { status: 500 });
  }
}

// Для зручності дозволяємо POST як синонім PUT
export async function POST(req: Request) {
  return PUT(req);
}
