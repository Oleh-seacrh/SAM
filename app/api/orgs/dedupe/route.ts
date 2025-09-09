// app/api/orgs/dedupe/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}
function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).trim().replace(/\s+/g, " ");
}
function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const name = normalizeName(searchParams.get("name"));
  const domain = normalizeDomain(searchParams.get("domain"));
  const companyEmail = normalizeEmail(searchParams.get("company_email"));
  const personalEmail = normalizeEmail(searchParams.get("personal_email"));

  const emailList = [companyEmail, personalEmail].filter(Boolean) as string[];

  // 1) exact domain
  const byDomain = domain
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(domain) = ${domain}
        limit 10;
      `
    : [];

  // 2) exact emails → existing orgs via contacts
  const byEmails = emailList.length
    ? await sql/*sql*/`
        select distinct o.id, o.name, o.domain, o.country, o.org_type, c.email
        from contacts c
        join organizations o on o.id = c.org_id
        where lower(c.email) = any(${sql.array(emailList)})
        limit 20;
      `
    : [];

  // 3) loose name match (safe fallback without pg_trgm)
  const byName = name
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(name) ilike ${'%' + name.toLowerCase() + '%'}
        order by created_at desc
        limit 20;
      `
    : [];

  // merge unique by id
  type Org = { id: number; name: string; domain?: string | null; country?: string | null; org_type?: string | null; email?: string | null; };
  const seen = new Set<number>();
  const pushUnique = (arr: Org[], acc: Org[]) => {
    for (const r of arr) {
      if (!seen.has(r.id)) { seen.add(r.id); acc.push(r); }
    }
  };
  const merged: Org[] = [];
  pushUnique(byDomain as any, merged);
  pushUnique((byEmails as any).map((x: any) => ({ ...x, email: x.email })), merged);
  pushUnique(byName as any, merged);

  // shape with match info
  const duplicates = merged.map((o: any) => {
    const domain_exact = !!(domain && o.domain && domain.toLowerCase() === String(o.domain).toLowerCase());
    const name_exact = !!(name && o.name && name.toLowerCase() === String(o.name).toLowerCase());
    const name_partial = !!(name && o.name && String(o.name).toLowerCase().includes(name.toLowerCase()));

    // via_email: якщо цей org прийшов з byEmails — покажемо який саме
    let via_email: string | null = null;
    if ((byEmails as any).length) {
      const hit = (byEmails as any).find((x: any) => x.id === o.id);
      via_email = hit?.em_
