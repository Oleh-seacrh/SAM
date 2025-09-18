export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql, sql } from "@/lib/db";

// Нормалізація домену
function normalizeDomain(raw?: string | null) {
  if (!raw) return null;
  try {
    let v = raw.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
    else v = v.split("/")[0];
    return v.replace(/^www\./, "");
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, "");
  }
}

/**
 * GET /api/orgs/:id
 * Повертає:
 *  - org: дані організації
 *  - inquiries: список заявок (останнє зверху)
 *  - items: map { inquiry_id -> масив позицій }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sqlInstance = getSql();
    const id = params.id;

    const org = (
      (await sqlInstance/*sql*/`
        select
          id,
          name,
          org_type,
          domain,
          country,
          last_contact_at,
          created_at
        from organizations
        where id = ${id}
        limit 1;
      `) as any
    )[0];

    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inquiries = (await sqlInstance/*sql*/`
      select id, summary, created_at
      from inquiries
      where org_id = ${id}
      order by created_at desc;
    `) as any;

    const items: Record<string, any[]> = {};
    if (inquiries.length) {
      const rows = (await sqlInstance/*sql*/`
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
        order by ii.created_at desc
      `) as any;

      for (const r of rows) {
        (items[r.inquiry_id] ??= []).push(r);
      }
    }

    return NextResponse.json({ org, inquiries, items });
  } catch (e: any) {
    console.error("GET organization error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/orgs/:id
 * Оновлює організацію
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const tagsCsv =
    Array.isArray(body.tags) ? body.tags.join(",") : typeof body.tags === "string" ? body.tags : null;

  const dealValue =
    body.deal_value_usd === "" || body.deal_value_usd == null ? null : Number(body.deal_value_usd);
  const lastContactISO = body.last_contact_at ? new Date(body.last_contact_at).toISOString() : null;

  const rows =
    await sql/*sql*/`
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
        linkedin_url    = ${body.linkedin_url ?? null},
        facebook_url    = ${body.facebook_url ?? null}, 
        status          = ${body.status ?? null},
        size_tag        = ${body.size_tag ?? null},
        source          = ${body.source ?? null},
        note            = ${body.note ?? null},
        brand           = ${body.brand ?? null},
        product         = ${body.product ?? null},
        quantity        = ${body.quantity ?? null},
        deal_value_usd  = ${dealValue},
        last_contact_at = ${lastContactISO},
        tags            = CASE
                            WHEN ${tagsCsv} IS NULL OR ${tagsCsv} = '' THEN NULL
                            ELSE string_to_array(${tagsCsv}, ',')
                          END,
        updated_at      = now()
      WHERE id = ${id}
      RETURNING *;
    `;

  if (!rows?.length) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: rows[0] });
}

/**
 * DELETE /api/orgs/:id
 * Видаляє організацію
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sqlInstance = getSql();
    await sqlInstance/*sql*/`
      delete from organizations
      where id = ${params.id};
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE organization error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
