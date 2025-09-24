export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// М'яка перевірка email (мінімальна; у репо подібний підхід)
function isSoftEmail(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return !!s && s.includes("@") && s.includes(".");
}

// М'яка перевірка домену: дозволяємо піддомени; без протоколу (зрізаємо якщо є)
function isSoftDomain(v: unknown): boolean {
  if (typeof v !== "string") return false;
  let s = v.trim().toLowerCase();
  if (!s) return false;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  // дуже проста форма: щонайменше одна крапка, tld 2+ символи
  return /\.[a-z0-9-]{2,}$/.test(s);
}

// Нормалізація домену — як у вже існуючих місцях (спрощена)
function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}

// Нормалізація телефону (мінімальна): залишити цифри та +
function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/[^0-9+]/g, "");
  return digits;
}

// Нормалізація імені / назви
function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ");
}

// Нормалізація email (підхід, подібний до вже існуючого)
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

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  try {
    const rows = await sql/*sql*/`
      select profile
      from tenant_settings
      where tenant_id = ${tenantId}
      limit 1
    `;
    const profile = rows[0]?.profile ?? {};
    return NextResponse.json({ profile });
  } catch (e) {
    console.error("GET /api/settings/profile error", e);
    return NextResponse.json({ profile: {} });
  }
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact_name = normalizeName(body.contact_name);
  const company_name = normalizeName(body.company_name);
  const company_email = body.company_email ? normalizeEmail(body.company_email) : "";
  const company_phone = body.company_phone ? normalizePhone(body.company_phone) : "";
  const company_domain_raw = body.company_domain || "";
  const company_domain_norm = company_domain_raw ? normalizeDomain(company_domain_raw) : "";
  const company_country = (body.company_country || "").trim();

  if (company_email && !isSoftEmail(company_email)) {
    return NextResponse.json({ error: "Invalid company_email" }, { status: 400 });
  }
  if (company_domain_raw && !isSoftDomain(company_domain_raw)) {
    return NextResponse.json({ error: "Invalid company_domain" }, { status: 400 });
  }

  const profile = {
    contact_name,
    company_name,
    company_email,
    company_phone,
    company_domain: company_domain_norm || "",
    company_country,
  };

  await sql/*sql*/`
    insert into tenant_settings (tenant_id, profile)
    values (${tenantId}, ${profile}::jsonb)
    on conflict (tenant_id) do update
      set profile = excluded.profile,
          updated_at = now()
  `;

  return NextResponse.json({ ok: true });
}

// POST як синонім PUT (аналог підходу enrich)
export async function POST(req: Request) {
  return PUT(req);
}
