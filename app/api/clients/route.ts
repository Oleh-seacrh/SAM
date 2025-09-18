export const runtime = "nodejs";
import { getSql, toPgTextArray } from "@/lib/db";

export async function GET() {
  const sql = getSql();
  const rows = await sql/* sql */`
    SELECT
      id,
      company_name   AS "companyName",
      domain,
      country, industry,
      brand, product, quantity, deal_value_usd AS "dealValueUSD",
      size_tag       AS "sizeTag",
      tags,
      contact_name   AS "contactName",
      contact_role   AS "contactRole",
      contact_email  AS "contactEmail",
      contact_phone  AS "contactPhone",
      linkedin_url, facebook_url,   
      status, note, source,
      extract(epoch from added_at)*1000  AS "addedAt",
      extract(epoch from updated_at)*1000 AS "updatedAt"
    FROM clients
    ORDER BY added_at DESC
    LIMIT 200;
  `;
  const norm = rows.map((r: any) => ({
    ...r,
    tags: Array.isArray(r.tags)
      ? r.tags
      : typeof r.tags === "string"
        ? r.tags.replace(/^{|}$/g, "").split(",").map((s: string) => s.replace(/^"(.*)"$/,"$1")).filter(Boolean)
        : [],
  }));
  return Response.json({ items: norm });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.companyName || !body.domain || !body.status) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }
  const sql = getSql();
  const tagsLiteral = toPgTextArray(Array.isArray(body.tags) ? body.tags : []);

  const rows = await sql/* sql */`
    INSERT INTO clients (
      company_name, domain, country, industry,
      brand, product, quantity, deal_value_usd,
      size_tag, tags,
      contact_name, contact_role, contact_email, contact_phone,
      status, note, source, added_at, updated_at
    ) VALUES (
      ${body.companyName}, ${body.domain}, ${body.country ?? null}, ${body.industry ?? null},
      ${body.brand ?? null}, ${body.product ?? null}, ${body.quantity ?? null}, ${body.dealValueUSD ?? null},
      ${body.sizeTag ?? null}, ${tagsLiteral}::text[],
      ${body.contactName ?? null}, ${body.contactRole ?? null}, ${body.contactEmail ?? null}, ${body.contactPhone ?? null},
      ${body.status}, ${body.note ?? null}, ${body.source ?? "google"}, NOW(), NOW()
    )
    RETURNING id;
  `;
  return Response.json({ item: { id: rows[0].id } }, { status: 201 });
}
