// app/api/orgs/dedupe/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  try { if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname; } catch {}
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

  const byDomain = domain
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(domain) = ${domain}
        limit 10;
      `
    : [];

  // ⚠️ БЕЗ sql.array: використовуємо CSV + string_to_array
  const byEmails = emailList.length
    ? await sql/*sql*/`
        select distinct o.id, o.name, o.domain, o.country, o.org_type, c.email
        from contacts c
        join organizations o on o.id = c.org_id
        where lower(c.email) = any(string_to_array(${emailList.join(",")}, ','))
        limit 20;
      `
    : [];

  const byName = name
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(name) like ${'%' + name.toLowerCase() + '%'}
        order by created_at desc
        limit 20;
      `
    : [];

  type Org = { id: number; name: string; domain?: string | null; country?: string | null; org_type?: string | null; email?: string | null; };
  const seen = new Set<number>();
  const merged: Org[] = [];

  function pushUnique(arr: Org[]) {
    for (const r of arr) {
      if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
    }
  }
  pushUnique(byDomain as any);
  pushUnique((byEmails as any).map((x: any) => ({ ...x, email: x.email })));
  pushUnique(byName as any);

  const duplicates = merged.map((o: any) => {
    const domain_exact = !!(domain && o.domain && domain.toLowerCase() === String(o.domain).toLowerCase());
    const name_exact = !!(name && o.name && name.toLowerCase() === String(o.name).toLowerCase());
    const name_partial = !!(name && o.name && String(o.name).toLowerCase().includes(name.toLowerCase()));
    let via_email: string | null = null;
    if ((byEmails as any).length) {
      const hit = (byEmails as any).find((x: any) => x.id === o.id);
      via_email = hit?.email ?? null;
    }
    return {
      id: o.id,
      name: o.name,
      domain: o.domain,
      country: o.country,
      org_type: o.org_type,
      match: { domain_exact, name_exact, name_partial, via_email },
    };
  });

  return NextResponse.json({ duplicates });
}
