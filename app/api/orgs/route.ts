// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* ───────── helpers ───────── */
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

// map UI tabs → org_type in DB
function mapTabToType(v?: string | null): "client" | "prospect" | "supplier" | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "clients" || s === "client") return "client";
  if (s === "prospects" || s === "prospect") return "prospect";
  if (s === "suppliers" || s === "supplier") return "supplier";
  return null;
}

/* ───────── GET: list organizations ─────────
   Query:
   - q: string
   - type OR tab: 'client' | 'prospect' | 'supplier' (UI може надсилати 'Clients' тощо)
   - limit, offset
*/
export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();

  // приймаємо type | tab | org_type
  const rawType = searchParams.get("type") ?? searchParams.get("tab") ?? searchParams.get("org_type");
  const type = mapTabToType(rawType); // "client" | "prospect" | "supplier" | null

  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    // динамічна побудова WHERE — без null-параметрів
    const rows = await sql/*sql*/`
      select id, name, domain, country, org_type, last_contact_at, created_at
      from organizations
      where 1 = 1
      ${type ? sql/*sql*/`and org_type = ${type}` : sql``}
      ${
        q
          ? sql/*sql*/`
              and (
                lower(name) like ${'%' + q + '%'}
                or (domain is not null and lower(domain) like ${'%' + q + '%'})
              )
            `
          : sql``
      }
      order by created_at desc
      limit ${limit} offset ${offset};
    `;

    return NextResponse.json({ items: rows, limit, offset });
  } catch (err: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}


/* ───────── POST: create with soft-lock & hard-lock ───────── */
export async function POST(req: NextRequest) {
  const sql = getSql();

  // 1) Parse body
  const body = await req.json().catch(() => ({} as any));
  const name = normalizeName(body?.name);
  const domain = normalizeDomain(body?.domain);
  const country = body?.country ?? null;
  const org_type = mapTabToType(body?.org_type) ?? "client";

  const emails: string[] = (Array.isArray(body?.emails) ? body.emails : (body?.emails ? [body?.emails] : []))
    .map((e: any) => normalizeEmail(String(e)))
    .filter(Boolean) as string[];

  if (!name) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: "Name is required" }, { status: 400 });
  }

  // 2) Soft-lock via /api/orgs/dedupe
  const params = new URLSearchParams();
  params.set("name", name);
  if (domain) params.set("domain", domain);
  if (emails[0]) params.set("company_email", emails[0]);
  if (emails[1]) params.set("personal_email", emails[1]);

  const dedupeUrl = new URL("/api/orgs/dedupe", req.url);
  dedupeUrl.search = params.toString();

  let duplicates: any[] = [];
  try {
    const dedupeRes = await fetch(dedupeUrl.toString(), { method: "GET" });
    if (dedupeRes.ok) {
      const data = await dedupeRes.json().catch(() => ({}));
      duplicates = data?.duplicates ?? data?.candidates ?? [];
    }
  } catch {
    // ігноруємо—soft-lock не повинен ламати створення зовсім
  }

  const allowOverride = req.headers.get("x-allow-duplicate") === "true";
  if (duplicates.length && !allowOverride) {
    return NextResponse.json(
      { error: "DUPLICATE_SOFTLOCK", duplicates },
      { status: 409 }
    );
  }

  // 3) Insert + hard-lock
  try {
    const org = (await sql/*sql*/`
      insert into organizations (name, domain, country, org_type)
      values (${name}, ${domain}, ${country}, ${org_type})
      returning id, name, domain, country, org_type, created_at;
    ` as any)[0];

    if (emails.length) {
      await sql/*sql*/`
        insert into contacts (org_id, email)
        select ${org.id}, unnest(${sql.array(emails)})
        on conflict (email) do nothing;
      `;
    }

    return NextResponse.json({ org }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const isOrgDomain = msg.includes("organizations_domain_uniq");
    const isOrgName = msg.includes("organizations_name_uniq");
    const isContactEmail = msg.includes("contacts_email_uniq");

    if (isOrgDomain || isOrgName || isContactEmail) {
      return NextResponse.json(
        {
          error: "DUPLICATE_HARDLOCK",
          detail: isOrgDomain
            ? "Organization with the same domain already exists."
            : isOrgName
            ? "Organization with the same name already exists."
            : "Contact with the same email already exists.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: msg },
      { status: 500 }
    );
  }
}

/* ───────── OPTIONS (щоб не ловити 405) ───────── */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
