// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* helpers */
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
function mapTabToType(v?: string | null): "client"|"prospect"|"supplier"|null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s === "clients" || s === "client") return "client";
  if (s === "prospects" || s === "prospect") return "prospect";
  if (s === "suppliers" || s === "supplier") return "supplier";
  return null;
}

/* GET: list */
export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const rawType = searchParams.get("type") ?? searchParams.get("tab") ?? searchParams.get("org_type");
  const type = mapTabToType(rawType);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
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

    return NextResponse.json({
      items: rows,   // для нового UI
      orgs: rows,    // для старого UI
      data: rows,    // на всяк
      limit, offset,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const sql = getSql();

  // helpers
  const normDomain = (raw?: string | null): string | null => {
    if (!raw) return null;
    let v = String(raw).trim().toLowerCase();
    try { if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname; } catch {}
    v = v.replace(/^www\./, "");
    return v || null;
  };
  const normName = (raw?: string | null): string => (raw ? String(raw).trim().replace(/\s+/g, " ") : "");
  const normEmail = (raw?: string | null): string | null => {
    if (!raw) return null;
    const v = String(raw).trim().toLowerCase();
    return v.includes("@") ? v : null;
  };

  const body = await req.json().catch(() => ({}));
  const allowDuplicate = req.headers.get("x-allow-duplicate") === "true";

  const name = normName(body?.name);
  const org_type = (body?.org_type || "prospect") as string;
  const domain = normDomain(body?.domain);
  const country = body?.country ? String(body.country) : null;

  const emails: string[] = Array.isArray(body?.emails)
    ? body.emails.map(normEmail).filter(Boolean) as string[]
    : [];

  // --- HARDLOCK по домену (точний збіг)
  if (domain) {
    const hit = await sql/*sql*/`
      select id, name from organizations
      where lower(domain) = ${domain}
      limit 1;
    `;
    if (hit.length && !allowDuplicate) {
      return new Response(
        JSON.stringify({
          error: "DUPLICATE_HARDLOCK",
          detail: "Organization with the same domain already exists.",
          duplicates: hit,
        }),
        { status: 409, headers: { "content-type": "application/json" } }
      );
    }
  }

  // --- SOFTLOCK по e-mail та назві
  const candidates: any[] = [];

  if (emails.length) {
    const csv = emails.join(",");
    const byEmail = await sql/*sql*/`
      select id, name, domain, country, org_type, general_email, contact_email
      from organizations
      where
        lower(coalesce(general_email,'')) = any(string_to_array(${csv}, ',')) or
        lower(coalesce(contact_email,'')) = any(string_to_array(${csv}, ','))
      limit 20;
    `;
    for (const r of byEmail as any[]) {
      let via: string | null = null;
      for (const e of emails) {
        if (r.general_email && r.general_email.toLowerCase() === e) { via = e; break; }
        if (r.contact_email && r.contact_email.toLowerCase() === e) { via = e; break; }
      }
      candidates.push({
        id: r.id, name: r.name, domain: r.domain, country: r.country, org_type: r.org_type,
        match: { via_email: via }
      });
    }
  }

  if (name) {
    const exact = await sql/*sql*/`
      select id, name, domain, country, org_type
      from organizations
      where lower(name) = ${name.toLowerCase()}
      limit 20;
    `;
    const like = await sql/*sql*/`
      select id, name, domain, country, org_type
      from organizations
      where lower(name) like ${"%" + name.toLowerCase() + "%"}
      limit 20;
    `;
    const seen = new Set<string>();
    for (const r of [...(exact as any[]), ...(like as any[])]) {
      const key = String(r.id);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        id: r.id, name: r.name, domain: r.domain, country: r.country, org_type: r.org_type,
        match: { name_exact: r.name?.toLowerCase() === name.toLowerCase(), name_partial: true }
      });
    }
  }

  if (candidates.length && !allowDuplicate) {
    return new Response(
      JSON.stringify({ error: "DUPLICATE_SOFTLOCK", duplicates: candidates }),
      { status: 409, headers: { "content-type": "application/json" } }
    );
  }

  // --- Створення
  const orgRows = await sql/*sql*/`
    insert into organizations (name, org_type, domain, country)
    values (${name || null}, ${org_type}, ${domain}, ${country})
    returning *;
  `;
  const org = orgRows[0];

  // --- М'яке збереження e-mail'ів, якщо є відповідні колонки
  if (emails.length) {
    try {
      await sql/*sql*/`
        update organizations
        set
          general_email = coalesce(general_email, ${emails[0] || null}),
          contact_email = coalesce(contact_email, ${emails[1] || null})
        where id = ${org.id};
      `;
    } catch {
      // якщо колонок немає — ігноруємо, але створення вже відбулось
    }
  }

  return new Response(JSON.stringify({ id: org.id, org }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}


/* OPTIONS */
export async function OPTIONS() { return new Response(null, { status: 204 }); }
