// app/api/orgs/dedupe/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { normalizeDomain, normalizeName, normalizeEmail } from "@/lib/normalize";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);

    const nameRaw = (searchParams.get("name") || "").trim();
    const domainRaw = searchParams.get("domain");
    const companyEmailRaw = searchParams.get("company_email");
    const personalEmailRaw = searchParams.get("personal_email");

    const nameNorm = nameRaw ? normalizeName(nameRaw).toLowerCase() : "";
    const domainNorm = normalizeDomain(domainRaw);
    const companyEmailNorm = normalizeEmail(companyEmailRaw);
    const personalEmailNorm = normalizeEmail(personalEmailRaw);

    const SIM_THRESHOLD = 0.6;

    // Якщо нічого не введено — повернути порожньо
    if (!nameNorm && !domainNorm && !companyEmailNorm && !personalEmailNorm) {
      return NextResponse.json({ duplicates: [] }, { status: 200 });
    }

    const rows = await sql/*sql*/`
      WITH cand AS (
        SELECT
          id, name, org_type, domain, country,
          company_email, personal_email, last_contact_at,
          similarity(lower(name), ${nameNorm}) AS name_sim,
          CASE WHEN ${domainNorm} IS NOT NULL AND lower(COALESCE(domain,'')) = ${domainNorm ?? ""} THEN 1 ELSE 0 END AS domain_exact,
          CASE WHEN ${nameRaw.toLowerCase()} <> '' AND lower(name) = ${nameRaw.toLowerCase()} THEN 1 ELSE 0 END AS name_exact,
          CASE WHEN ${companyEmailNorm} IS NOT NULL AND lower(COALESCE(company_email,'')) = ${companyEmailNorm ?? ""} THEN 1 ELSE 0 END AS company_email_exact,
          CASE WHEN ${personalEmailNorm} IS NOT NULL AND lower(COALESCE(personal_email,'')) = ${personalEmailNorm ?? ""} THEN 1 ELSE 0 END AS personal_email_exact
        FROM organizations
        WHERE
          (${domainNorm} IS NOT NULL AND lower(COALESCE(domain,'')) = ${domainNorm ?? ""})
          OR (${nameNorm} <> '' AND similarity(lower(name), ${nameNorm}) >= ${SIM_THRESHOLD})
          OR (${nameRaw.toLowerCase()} <> '' AND lower(name) = ${nameRaw.toLowerCase()})
          OR (${companyEmailNorm} IS NOT NULL AND lower(COALESCE(company_email,'')) = ${companyEmailNorm ?? ""})
          OR (${personalEmailNorm} IS NOT NULL AND lower(COALESCE(personal_email,'')) = ${personalEmailNorm ?? ""})
        ORDER BY
          domain_exact DESC, name_exact DESC,
          company_email_exact DESC, personal_email_exact DESC,
          name_sim DESC NULLS LAST, last_contact_at DESC NULLS LAST
        LIMIT 10
      )
      SELECT * FROM cand;
    ` as any[];

    return NextResponse.json(
      {
        duplicates: rows.map((c) => ({
          id: c.id,
          name: c.name,
          org_type: c.org_type,
          domain: c.domain,
          country: c.country,
          company_email: c.company_email,
          personal_email: c.personal_email,
          last_contact_at: c.last_contact_at,
          name_similarity: Number(c.name_sim ?? 0),
          domain_exact: Boolean(c.domain_exact),
          name_exact: Boolean(c.name_exact),
          company_email_exact: Boolean(c.company_email_exact),
          personal_email_exact: Boolean(c.personal_email_exact),
        })),
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("GET /api/orgs/dedupe error:", e);
    return NextResponse.json({ duplicates: [] }, { status: 200 });
  }
}
