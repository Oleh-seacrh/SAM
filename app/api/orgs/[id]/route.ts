// app/api/orgs/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* ------------ helpers ------------ */
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

/* =====================================
   GET /api/orgs/:id
   Повертає { org, inquiries, items }
   items: map { inquiry_id -> inquiry_items[] }
===================================== */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1) організація
    const orgRows = (await sql/*sql*/`
      select
        id,
        name,
        org_type,
        domain,
        country,
        industry,
        general_email,
        contact_name,
        contact_email,
        contact_phone,
        status,
        size_tag,
        source,
        note,
        brand,
        product,
        quantity,
        deal_value_usd,
        last_contact_at,
        tags,
        array_to_string(tags, ',') as tags_csv,  -- на випадок, якщо інпут очікує CSV
        created_at,
        updated_at
      from public.organizations
      where id = ${id}
      limit 1;
    `) as any[];

    const org = orgRows?.[0];
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) заявки
    let inquiries: any[] = [];
    try {
      inquiries = (await sql/*sql*/`
        select id, summary, created_at
        from public.inquiries
        where org_id = ${id}
        order by created_at desc;
      `) as any[];
    } catch (e) {
      console.error("GET inquiries failed:", e);
      inquiries = [];
    }

    // 3) позиції заявок (JOIN без IN/ANY)
    const items: Record<string, any[]> = {};
    if (inquiries.length) {
      try {
        const rows = (await sql/*sql*/`
          select
            ii.inquiry_id,
            ii.id,
            ii.brand,
            ii.product,
            ii.quantity,
            ii.unit,
            ii.unit_price,
            ii.created_at
          from public.inquiry_items ii
          join public.inquiries iq on iq.id = ii.inquiry_id
          where iq.org_id = ${id}
          order by ii.created_at desc;
        `) as any[];

        for (const r of rows) {
          (items[r.inquiry_id] ??= []).push(r);
        }
      } catch (e) {
        console.error("GET inquiry_items failed:", e);
      }
    }

    return NextResponse.json({ org, inquiries, items }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/orgs/[id] failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/* =====================================
   PUT /api/orgs/:id  — оновлення організації
===================================== */
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
    const tagsCsv =
      Array.isArray(body.tags) ? body.tags.join(",")
      : typeof body.tags === "string" ? body.tags
      : null;

    const dealValue =
      body.deal_value_usd === "" || body.deal_value_usd == null
        ? null
        : Number(body.deal_value_usd);

    const lastContactISO =
      body.last_contact_at ? new Date(body.last_contact_at).toISOString() : null;

    const rows = await sql/*sql*/`
      UPDATE public.organizations
      SET
        name            = ${body.name ?? null},
        domain          = ${normalizeDomain(body.domain)},
        country         = ${body.country ?? null},
        industry        = ${body.industry ?? null},
        general_email   = ${body.general_email ?? null},
        contact_name    = ${body.contact_name ?? null},
        contact_email   = ${body.contact_email ?? null},
        contact_phone   = ${body.contact_phone ?? null},
        status          = ${body.status ?? null},
        size_tag        = ${body.size_tag ?? null},
        source          = ${body.source ?? null},
        note            = ${body.note ?? null},
        brand           = ${body.brand ?? null},
        product         = ${body.product ?? null},
        quantity        = ${body.quantity ?? null},
        deal_value_usd  = ${dealValue}::numeric,
        last_contact_at = ${lastContactISO}::timestamptz,
        tags            = string_to_array(NULLIF(${tagsCsv}::text, ''), ','),
        updated_at      = now()
      WHERE id = ${id}
      RETURNING *;
    `;

    if (!rows || !rows.length) {
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

/* =====================================
   DELETE /api/orgs/:id
===================================== */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    await sql/*sql*/`
      delete from public.organizations
      where id = ${params.id};
    `;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("DELETE /api/orgs/[id] failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/* =====================================
   OPTIONS /api/orgs/:id  (на випадок preflight)
===================================== */
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET,PUT,DELETE,OPTIONS" },
  });
}
