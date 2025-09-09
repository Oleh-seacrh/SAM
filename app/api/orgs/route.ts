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
// app/api/orgs/route.ts  — тільки GET нижче заміни
export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const rawType = searchParams.get("type") ?? searchParams.get("tab") ?? searchParams.get("org_type");
  const type = mapTabToType(rawType); // "client" | "prospect" | "supplier" | null
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    // для сумісності з UI: лічильники
    const [{ total }] = await sql/*sql*/`select count(*)::int as total from organizations;` as any;
    const byType = await sql/*sql*/`
      select org_type, count(*)::int as cnt
      from organizations
      group by org_type
      order by org_type;
    ` as any;

    // основний вибір
    const rows = await sql/*sql*/`
      select id, name, domain, country, org_type, last_contact_at, created_at
      from organizations
      where 1=1
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

    // ⚠️ СУМІСНІСТЬ З ФРОНТОМ:
    // - деякі екрани могли очікувати "items", інші — "orgs" або "data".
    // - віддаємо все одразу, щоб UI гарантовано підхопив.
    const payload = {
      items: rows,
      orgs: rows,
      data: rows,
      limit,
      offset,
      total,
      countsByType: byType,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}



/* ───────── POST: create with soft-lock & hard-lock ───────── */
// app/api/orgs/route.ts  — тільки POST нижче заміни
export async function POST(req: NextRequest) {
  const sql = getSql();

  // helpers тут же (або вгорі файлу, якщо вже є)
  const normDomain = (raw?: string | null) => {
    if (!raw) return null;
    let v = String(raw).trim().toLowerCase();
    try { if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname; } catch {}
    v = v.replace(/^www\./, "");
    return v || null;
  };
  const normName = (raw?: string | null) => (raw ? String(raw).trim().replace(/\s+/g, " ") : "");
  const normEmail = (raw?: string | null) => {
    if (!raw) return null;
    const v = String(raw).trim().toLowerCase();
    return v.includes("@") ? v : null;
  };

  const body = await req.json().catch(() => ({} as any));

  const inputName = normName(body?.name);
  const domain = normDomain(body?.domain);
  const country = body?.country ?? null;
  const org_type = (body?.org_type || "client").toString().toLowerCase();

  const emails: string[] = (Array.isArray(body?.emails) ? body.emails : (body?.emails ? [body.emails] : []))
    .map((e: any) => normEmail(String(e)))
    .filter(Boolean) as string[];

  // Fallback для name (щоб не валити NOT NULL у БД)
  let name = inputName;
  if (!name) {
    if (domain) {
      // company.example -> Company
      const base = domain.split(".")[0] || "Unnamed";
      name = base.charAt(0).toUpperCase() + base.slice(1);
    } else if (emails[0]) {
      // john@acme.com -> acme
      const base = (emails[0].split("@")[1] || "").split(".")[0] || "Unnamed";
      name = base.charAt(0).toUpperCase() + base.slice(1);
    } else {
      name = "Unnamed";
    }
  }

  // 1) Soft-lock: перевірка на дублікати через dedupe (домен + emails)
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
  } catch { /* ignore soft-lock failure */ }

  const allowOverride = req.headers.get("x-allow-duplicate") === "true";
  if (duplicates.length && !allowOverride) {
    return NextResponse.json(
      { error: "DUPLICATE_SOFTLOCK", duplicates },
      { status: 409 }
    );
  }

  // 2) Insert + HARDLOCK: домен/назва/email (потрібні унікальні індекси, див. нижче)
  try {
    const org = (await sql/*sql*/`
      insert into organizations (name, domain, country, org_type)
      values (${name}, ${domain}, ${country}, ${org_type})
      returning id, name, domain, country, org_type, created_at;
    ` as any)[0];

    if (emails.length) {
      // Жодних ON CONFLICT — нехай унікальний індекс дає HARDLOCK, якщо email уже є
      await sql/*sql*/`
        insert into contacts (org_id, email)
        select ${org.id}, unnest(${sql.array(emails)});
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
            : "Contact email already exists.",
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
