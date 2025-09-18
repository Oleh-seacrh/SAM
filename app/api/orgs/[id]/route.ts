export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// нормалізація домену (прибирає http/https, www, шлях)
function normalizeDomain(raw?: string | null) {
  if (!raw) return null;
  try {
    let v = String(raw).trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
    else v = v.split("/")[0];
    return v.replace(/^www\./, "");
  } catch {
    return String(raw).trim().toLowerCase().replace(/^www\./, "");
  }
}

const strOrNull = (v: any) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const numOrNull = (v: any) =>
  v === "" || v === null || v === undefined ? null : Number(v);
const isoOrNull = (v: any) => {
  if (v === undefined || v === null || v === "") return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Віддаємо весь рядок, щоб UI мав усі поля
    const rows = await sql/*sql*/`
      select *
      from organizations
      where id = ${id}
      limit 1;
    `;
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/** Повне оновлення: пусті строки -> NULL (очищення поля) */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const sql = getSql();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  try {
    const name            = strOrNull(body.name);
    const domain          = normalizeDomain(strOrNull(body.domain));
    const country         = strOrNull(body.country);
    const industry        = strOrNull(body.industry);

    const linkedin_url    = strOrNull(body.linkedin_url);
    const facebook_url    = strOrNull(body.facebook_url);

    const general_email   = strOrNull(body.general_email);
    const contact_name    = strOrNull(body.contact_name);
    const contact_email   = strOrNull(body.contact_email);
    const contact_phone   = strOrNull(body.contact_phone);

    const status          = strOrNull(body.status);
    const size_tag        = strOrNull(body.size_tag);
    const source          = strOrNull(body.source);

    const note            = strOrNull(body.note);
    const brand           = strOrNull(body.brand);
    const product         = strOrNull(body.product);

    const quantity        = numOrNull(body.quantity);
    const deal_value_usd  = numOrNull(body.deal_value_usd);
    const last_contact_at = isoOrNull(body.last_contact_at);

    let tagsCsv: string | null = null;
    if (Array.isArray(body.tags)) {
      const arr = body.tags.map((x: any) => String(x).trim()).filter(Boolean);
      tagsCsv = arr.length ? arr.join(",") : null;
    } else if (typeof body.tags === "string") {
      const arr = body.tags.split(",").map((s) => s.trim()).filter(Boolean);
      tagsCsv = arr.length ? arr.join(",") : null;
    }

    const rows = await sql/*sql*/`
      UPDATE public.organizations
      SET
        name            = ${name},
        domain          = ${domain},
        country         = ${country},
        industry        = ${industry},
        linkedin_url    = ${linkedin_url},
        facebook_url    = ${facebook_url},
        general_email   = ${general_email},
        contact_name    = ${contact_name},
        contact_email   = ${contact_email},
        contact_phone   = ${contact_phone},
        status          = ${status},
        size_tag        = ${size_tag},
        source          = ${source},
        note            = ${note},
        brand           = ${brand},
        product         = ${product},
        quantity        = ${quantity},
        deal_value_usd  = ${deal_value_usd},
        last_contact_at = ${last_contact_at},
        tags            = ${tagsCsv === null ? null : sql/*sql*/`string_to_array(${tagsCsv}, ',')`},
        updated_at      = now()
      WHERE id = ${id}
      RETURNING *;
    `;

    if (!rows?.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0], { status: 200 });
  } catch (e: any) {
    const msg = e?.detail || e?.message || String(e);
    console.error("PUT /api/orgs/[id] failed:", e);
    return new NextResponse(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    await sql/*sql*/`delete from organizations where id = ${params.id};`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
