export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { getSql, toPgTextArray } from "@/lib/db";

type NewClient = {
  companyName: string;
  domain: string;
  url: string;
  country?: string;
  industry?: string;
  brand?: string;
  product?: string;
  quantity?: string;
  dealValueUSD?: number;
  sizeTag?: "BIG" | "SMALL";
  tags?: string[];
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: "New" | "Contacted" | "Qualified" | "Bad Fit";
  note?: string;
  source?: string; // "google" | "manual"
};

export async function GET() {
  const sql = getSql();
  const rows = await sql/* sql */`
    SELECT id,
           company_name   AS "companyName",
           domain, url, country, industry,
           brand, product, quantity, deal_value_usd AS "dealValueUSD",
           size_tag       AS "sizeTag",
           tags,
           contact_name   AS "contactName",
           contact_role   AS "contactRole",
           contact_email  AS "contactEmail",
           contact_phone  AS "contactPhone",
           status, note, source,
           extract(epoch from added_at)*1000  AS "addedAt",
           extract(epoch from updated_at)*1000 AS "updatedAt"
    FROM clients
    ORDER BY added_at DESC
    LIMIT 200;
  `;
  // neon returns text[] already parsed as string like "{a,b}" → normalize to string[]
  const norm = rows.map((r: any) => ({
    ...r,
    tags: Array.isArray(r.tags)
      ? r.tags
      : typeof r.tags === "string"
        ? r.tags.replace(/^{|}$/g, "").split(",").map((s: string) => s.replace(/^"(.*)"$/,'$1')).filter(Boolean)
        : [],
  }));
  return Response.json({ items: norm });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewClient;
  if (!body.companyName || !body.domain || !body.url) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const sql = getSql();
  const tags = Array.isArray(body.tags) ? body.tags.filter(Boolean) : [];
  const tagsLiteral = toPgTextArray(tags); // -> {"a","b"}

  const rows = await sql/* sql */`
    INSERT INTO clients (
      company_name, domain, url, country, industry,
      brand, product, quantity, deal_value_usd,
      size_tag, tags,
      contact_name, contact_role, contact_email, contact_phone,
      status, note, source, added_at, updated_at
    ) VALUES (
      ${body.companyName}, ${body.domain}, ${body.url}, ${body.country ?? null}, ${body.industry ?? null},
      ${body.brand ?? null}, ${body.product ?? null}, ${body.quantity ?? null}, ${body.dealValueUSD ?? null},
      ${body.sizeTag ?? null}, ${tagsLiteral}::text[],
      ${body.contactName ?? null}, ${body.contactRole ?? null}, ${body.contactEmail ?? null}, ${body.contactPhone ?? null},
      ${body.status}, ${body.note ?? null}, ${body.source ?? null}, NOW(), NOW()
    )
    RETURNING id;
  `;

  return Response.json({ id: rows[0].id }, { status: 201 });
}
