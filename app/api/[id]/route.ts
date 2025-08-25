export const runtime = "nodejs";

import { getSql, toPgTextArray } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id) return Response.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json();

  const sql = getSql();
  const tagsLiteral =
    Array.isArray(body.tags) ? toPgTextArray(body.tags) : null;

  const rows = await sql/* sql */`
    UPDATE clients SET
      company_name   = COALESCE(${body.companyName ?? null}, company_name),
      domain         = COALESCE(${body.domain ?? null}, domain),
      url            = COALESCE(${body.url ?? null}, url),
      country        = COALESCE(${body.country ?? null}, country),
      industry       = COALESCE(${body.industry ?? null}, industry),
      brand          = COALESCE(${body.brand ?? null}, brand),
      product        = COALESCE(${body.product ?? null}, product),
      quantity       = COALESCE(${body.quantity ?? null}, quantity),
      deal_value_usd = COALESCE(${body.dealValueUSD ?? null}, deal_value_usd),
      size_tag       = COALESCE(${body.sizeTag ?? null}, size_tag),
      tags           = COALESCE(${tagsLiteral}::text[], tags),
      contact_name   = COALESCE(${body.contactName ?? null}, contact_name),
      contact_role   = COALESCE(${body.contactRole ?? null}, contact_role),
      contact_email  = COALESCE(${body.contactEmail ?? null}, contact_email),
      contact_phone  = COALESCE(${body.contactPhone ?? null}, contact_phone),
      status         = COALESCE(${body.status ?? null}, status),
      note           = COALESCE(${body.note ?? null}, note),
      source         = COALESCE(${body.source ?? null}, source),
      updated_at     = NOW()
    WHERE id = ${id}
    RETURNING id;
  `;

  if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id) return Response.json({ error: "Bad id" }, { status: 400 });

  const sql = getSql();
  await sql/* sql */`DELETE FROM clients WHERE id = ${id}`;
  return Response.json({ ok: true });
}
