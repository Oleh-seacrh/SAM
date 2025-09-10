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

/* ======================= GET (STABLE) ======================= */
/* Мінімальна вибірка з полями, які точно є — те, що у вас і працювало */
/* GET: list */
export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const rawType =
    searchParams.get("type") ?? searchParams.get("tab") ?? searchParams.get("org_type");
  const type = mapTabToType(rawType);

  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  try {
    const rows = await sql/*sql*/`
      select
        o.id,
        o.name,
        o.org_type,
        o.domain,
        o.country,
        o.status,
        o.size_tag,
        o.source,
        o.tags,
        o.industry,
        o.contact_person,
        o.phone,
        o.general_email,
        o.contact_email,
        o.last_contact_at,
        o.created_at,

        -- агрегація з останнього інкваєра
        ia.brands,
        ia.products,
        ia.deal_value_usd,
        ia.latest_inquiry_at
      from organizations o
      left join v_inquiries_agg ia on ia.org_id = o.id
      where 1=1
        ${type ? sql/*sql*/`and o.org_type = ${type}` : sql``}
        ${
          q
            ? sql/*sql*/`
                and (
                  lower(o.name) like ${"%" + q + "%"}
                  or (o.domain is not null and lower(o.domain) like ${"%" + q + "%"})
                  or (o.tags   is not null and lower(o.tags)   like ${"%" + q + "%"})
                )
              `
            : sql``
        }
      order by o.created_at desc
      limit ${limit} offset ${offset};
    `;

    return NextResponse.json({
      items: rows,   // новий UI
      orgs: rows,    // старий UI не зламається
      data: rows,    // сумісність
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}


/* ======================= POST (ВАШ ПРАЦЮЮЧИЙ) ======================= */
/* POST: create org with hard/soft locks + optional fields */
export async function POST(req: NextRequest) {
  const sql = getSql();

  // helpers (ті самі норми, що й у твоєму файлі)
  const normDomain = (raw?: string | null): string | null => {
    if (!raw) return null;
    let v = String(raw).trim().toLowerCase();
    try { if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname; } catch {}
    v = v.replace(/^www\./, "");
    return v || null;
  };
  const normName = (raw?: string | null): string =>
    raw ? String(raw).trim().replace(/\s+/g, " ") : "";
  const normEmail = (raw?: string | null): string | null => {
    if (!raw) return null;
    const v = String(raw).trim().toLowerCase();
    return v.includes("@") ? v : null;
  };
  const normTags = (t: any): string | null => {
    if (Array.isArray(t)) {
      const arr = t.map((x) => String(x).trim()).filter(Boolean);
      return arr.length ? Array.from(new Set(arr)).join(", ") : null;
    }
    if (typeof t === "string") {
      const arr = t.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      return arr.length ? Array.from(new Set(arr)).join(", ") : null;
    }
    return null;
  };

  try {
    const body = await req.json().catch(() => ({} as any));
    const allowDuplicate = req.headers.get("x-allow-duplicate") === "true";

    // базові
    const domain = normDomain(body?.domain);
    const country = body?.country ? String(body.country) : null;
    const org_type = (() => {
      const s = (body?.org_type || "prospect").toString().toLowerCase();
      if (s === "clients" || s === "client") return "client";
      if (s === "prospects" || s === "prospect") return "prospect";
      if (s === "suppliers" || s === "supplier") return "supplier";
      return "prospect";
    })();

    // ім'я з фолбеками
    let name = normName(body?.name);
    const emailsArr: string[] = Array.isArray(body?.emails)
      ? (body.emails.map(normEmail).filter(Boolean) as string[])
      : [];
    if (!name) {
      if (domain) {
        const base = domain.split(".")[0] || "Unnamed";
        name = base.charAt(0).toUpperCase() + base.slice(1);
      } else if (emailsArr[0]) {
        const base = (emailsArr[0].split("@")[1] || "").split(".")[0] || "Unnamed";
        name = base.charAt(0).toUpperCase() + base.slice(1);
      } else {
        name = "Unnamed";
      }
    }

    // optional-поля, які можемо отримати уже на створенні
    const status          = body?.status ?? null;
    const size_tag        = body?.size_tag ?? null;
    const source          = body?.source ?? null;
    const tags            = normTags(body?.tags);
    const industry        = body?.industry ?? null;
    const contact_person  = body?.contact_person ?? null;
    const phone           = body?.phone ?? null;
    const general_email   = normEmail(body?.general_email) ?? emailsArr[0] ?? null;
    const contact_email   = normEmail(body?.contact_email) ?? emailsArr[1] ?? null;

    /* ---------- HARD LOCK: domain exact ---------- */
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

    /* ---------- SOFT LOCK: emails + name ---------- */
    const candidates: any[] = [];

    if (emailsArr.length) {
      const csv = emailsArr.join(",");
      const byEmail = await sql/*sql*/`
        select id, name, domain, country, org_type, general_email, contact_email
        from organizations
        where lower(coalesce(general_email,'')) = any(string_to_array(${csv}, ','))
           or lower(coalesce(contact_email,'')) = any(string_to_array(${csv}, ','))
        limit 20;
      `;
      for (const r of byEmail as any[]) {
        candidates.push({
          id: r.id, name: r.name, domain: r.domain, country: r.country, org_type: r.org_type,
          match: { via_email: true }
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

    /* ---------- INSERT мінімальний (як у тебе було) ---------- */
    const orgRows = await sql/*sql*/`
      insert into organizations (name, org_type, domain, country)
      values (${name || null}, ${org_type}, ${domain}, ${country})
      returning *;
    `;
    const org = orgRows[0];

    /* ---------- Одразу доновлюємо optional-поля, якщо вони є ---------- */
    try {
      await sql/*sql*/`
        update organizations
        set
          status          = ${status},
          size_tag        = ${size_tag},
          source          = ${source},
          tags            = ${tags},
          industry        = ${industry},
          contact_person  = ${contact_person},
          phone           = ${phone},
          general_email   = coalesce(${general_email}, general_email),
          contact_email   = coalesce(${contact_email}, contact_email)
        where id = ${org.id};
      `;
    } catch {
      // якщо якихось колонок немає — ігноруємо, створення вже відбулось
    }

    // Повернемо оновлений рядок (щоб на UI відразу бачити всі поля)
    const full = (await sql/*sql*/`select * from organizations where id = ${org.id} limit 1;`)[0];
    return new Response(JSON.stringify({ id: full.id, org: full }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}


/* OPTIONS */
export async function OPTIONS() { return new Response(null, { status: 204 }); }
