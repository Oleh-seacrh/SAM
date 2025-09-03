import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // не кешуємо

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const rows =
    await sql/*sql*/`SELECT * FROM public.organizations WHERE id = ${id} LIMIT 1`;
  if (!rows?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

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
