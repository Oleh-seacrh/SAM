// app/api/orgs/[id]/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Робимо результат з sql однаковим: масив рядків
function rowsOf<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && Array.isArray(res.rows)) return res.rows as T[];
  return [];
}

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const res = await sql/*sql*/`
      SELECT *
      FROM public.organizations
      WHERE id = ${id}
      LIMIT 1
    `;
    const rows = rowsOf(res);
    const row = rows[0];

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ВАЖЛИВО: повертаємо РЯДОК без обгорток, як очікує фронт
    return NextResponse.json(row, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/orgs/[id] failed:", e);
    return new NextResponse(
      JSON.stringify({ error: String(e?.message || e), stack: e?.stack }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
    }

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

    const res = await sql/*sql*/`
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
      RETURNING *
    `;
    const rows = rowsOf(res);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // повертаємо РЯДОК, як очікує фронт
    return NextResponse.json(row, { status: 200 });
  } catch (e: any) {
    console.error("PUT /api/orgs/[id] failed:", e);
    return new NextResponse(
      JSON.stringify({ error: String(e?.message || e), stack: e?.stack }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
