// app/api/orgs/dedupe/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

function normDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}
function normName(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).trim().replace(/\s+/g, " ");
}
function normEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const name = normName(searchParams.get("name"));
  const domain = normDomain(searchParams.get("domain"));
  const companyEmail = normEmail(searchParams.get("company_email"));
  const personalEmail = normEmail(searchParams.get("personal_email"));
  const emails = [companyEmail, personalEmail].filter(Boolean) as string[];
  const emailsCsv = emails.join(",");

  // 1) Точний збіг домену (жорсткий)
  const byDomain = domain
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(domain) = ${domain}
        limit 10;
      `
    : [];

  // 2) Збіги по e-mail'ах у самій таблиці organizations (general_email / contact_email)
  const byEmail = emails.length
    ? await sql/*sql*/`
        select id, name, domain, country, org_type, general_email, contact_email
        from organizations
        where
          lower(coalesce(general_email,'')) = any(string_to_array(${emailsCsv}, ',')) or
          lower(coalesce(contact_email,'')) = any(string_to_array(${emailsCsv}, ','))
        limit 20;
      `
    : [];

  // 3) Збіги по назві (exact + partial)
  const byNameExact = name
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(name) = ${name.toLowerCase()}
        limit 20;
      `
    : [];

  const byNameLike = name
    ? await sql/*sql*/`
        select id, name, domain, country, org_type
        from organizations
        where lower(name) like ${"%" + name.toLowerCase() + "%"}
        limit 20;
      `
    : [];

  // merge + проставити мітки збігів
  type Row = any;
  const seen = new Set<string>();
  const out: Array<{
    id: string | number;
    name: string;
    domain?: string | null;
    country?: string | null;
    org_type?: string | null;
    match: { domain_exact?: boolean; name_exact?: boolean; name_partial?: boolean; via_email?: string | null };
  }> = [];

  function push(row: Row, match: Partial<{ domain_exact: boolean; name_exact: boolean; name_partial: boolean; via_email: string | null }>) {
    const key = String(row.id);
    if (seen.has(key)) {
      // якщо вже доданий — підмерджуємо прапорці
      const idx = out.findIndex(x => String(x.id) === key);
      if (idx >= 0) out[idx].match = { ...out[idx].match, ...match };
      return;
    }
    seen.add(key);
    out.push({
      id: row.id,
      name: row.name,
      domain: row.domain,
      country: row.country,
      org_type: row.org_type,
      match: { ...match },
    });
  }

  (byDomain as Row[]).forEach(r => push(r, { domain_exact: true }));
  (byEmail as Row[]).forEach(r => {
    let via: string | null = null;
    for (const e of emails) {
      if (r.general_email && r.general_email.toLowerCase() === e) { via = e; break; }
      if (r.contact_email && r.contact_email.toLowerCase() === e) { via = e; break; }
    }
    push(r, { via_email: via });
  });
  (byNameExact as Row[]).forEach(r => push(r, { name_exact: true }));
  (byNameLike as Row[]).forEach(r => push(r, { name_partial: true }));

  return NextResponse.json({ duplicates: out });
}
