// app/api/orgs/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// --- GET (ти вже маєш робочий, залишаю короткий варіант) ---
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const orgRows = (await sql/*sql*/`
    select id, name, org_type, domain, country, last_contact_at, created_at
    from public.organizations
    where id = ${id}
    limit 1;
  `) as any[];
  const org = orgRows?.[0];
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ...твій код для inquiries + items через JOIN...
  return NextResponse.json({ org, inquiries: [], items: {} });
}

// --- PUT (саме це зніме 405) ---
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

  // Нормалізація вхідних полів (можеш лишити як у тебе)
  const normalizeDomain = (raw?: string | null) => {
    if (!raw) return null;
    try {
      let v = raw.trim().toLowerCase();
      if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
      else v = v.split("/")[0];
      return v.replace(/^www\./, "");
    } catch {
      return raw.trim().toLowerCase().replace(/^www\./, "");
    }
  };

  const tagsCsv =
    Array.isArray(body.tags) ? body.tags.join(",")
    : typeof body.tags === "string" ? body.tags
    : null;

  const dealValue =
    body.deal_value_usd === "" || body.deal_value_usd == null ? null : Number(body.deal_value_usd);

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

  if (!rows || !rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

// --- DELETE (опційно, але корисно мати) ---
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  await sql/*sql*/`delete from public.organizations where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}

// --- OPTIONS (щоб preflight ніколи не ламався) ---
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET,PUT,DELETE,OPTIONS" }
  });
}
