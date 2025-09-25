export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

const ZERO_TENANT = "00000000-0000-0000-0000-000000000000";

/* ---------- helpers ---------- */
function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isSoftEmail(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return !!s && s.includes("@") && s.includes(".");
}
function isSoftDomain(v: unknown): boolean {
  if (typeof v !== "string") return false;
  let s = v.trim().toLowerCase();
  if (!s) return false;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return /\.[a-z0-9-]{2,}$/.test(s);
}
function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}
function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/[^0-9+]/g, "");
}
function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ");
}
function normalizeEmail(raw?: string | null): string {
  return (raw || "").trim().toLowerCase();
}

type PutBody = {
  contact_name?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_domain?: string;
  company_country?: string;
};

/* ---------- GET ---------- */
export async function GET() {
  const sql = getSql();
  // м’який фолбек на ZERO tenant
  const rawTenant = await getTenantIdFromSession().catch(() => undefined);
  const tenantId = isUuid(rawTenant) ? rawTenant : ZERO_TENANT;

  try {
    const rows = await sql/*sql*/`
      select profile
      from tenant_settings
      where tenant_id = ${tenantId}
      limit 1
    `;
    const profile = rows?.[0]?.profile ?? {};
    return NextResponse.json({ profile });
  } catch (e: any) {
    console.error("GET /api/settings/profile error:", e?.message || e);
    return NextResponse.json({ profile: {} });
  }
}

/* ---------- PUT/POST ---------- */
export async function PUT(req: Request) {
  const sql = getSql();

  const rawTenant = await getTenantIdFromSession().catch(() => undefined);
  const tenantId = isUuid(rawTenant) ? rawTenant : ZERO_TENANT;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact_name   = normalizeName(body.contact_name);
  const company_name   = normalizeName(body.company_name);
  const company_email  = normalizeEmail(body.company_email);
  const company_phone  = normalizePhone(body.company_phone);
  const domainRaw      = body.company_domain || "";
  const company_domain = domainRaw ? (normalizeDomain(domainRaw) || "") : "";
  const company_country= (body.company_country || "").trim();

  if (company_email && !isSoftEmail(company_email)) {
    return NextResponse.json({ error: "Invalid company_email" }, { status: 400 });
  }
  if (domainRaw && !isSoftDomain(domainRaw)) {
    return NextResponse.json({ error: "Invalid company_domain" }, { status: 400 });
  }

  const profile = {
    contact_name,
    company_name,
    company_email,
    company_phone,
    company_domain,
    company_country,
  };

  try {
    await sql/*sql*/`
      insert into tenant_settings (tenant_id, profile)
      values (${tenantId}, ${profile}::jsonb)
      on conflict (tenant_id) do update
        set profile = excluded.profile,
            updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/settings/profile error:", e?.message || e);
    // покажемо коротку причину в UI
    return NextResponse.json({ error: "DB upsert failed" }, { status: 500 });
  }
}

// POST як синонім PUT
export async function POST(req: Request) {
  return PUT(req);
}
