// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/**
 * GET /api/orgs?org_type=client|prospect|supplier
 * Повертає список організацій з прев’ю (останній inquiry: brands/products, latest_inquiry_at)
 */
export async function GET(req: NextRequest) {
  const sql = getSql();
  const { searchParams } = new URL(req.url);
  const orgType = searchParams.get("org_type"); // "client" | "prospect" | "supplier" | null

  try {
    // last inquiry per org -> aggregate its items (brands/products)
    const rows = await sql/*sql*/`
      WITH last_inq AS (
        SELECT i.org_id, MAX(i.created_at) AS last_dt
        FROM inquiries i
        GROUP BY i.org_id
      ),
      last_inq_rows AS (
        SELECT i.id, i.org_id
        FROM inquiries i
        JOIN last_inq li
          ON li.org_id = i.org_id
         AND li.last_dt = i.created_at
      ),
      agg AS (
        SELECT
          lir.org_id,
          -- бренди/продукти з останнього inquiry (уникнемо null/порожніх)
          array_to_string(
            array_remove(array_agg(DISTINCT ii.brand) FILTER (WHERE ii.brand IS NOT NULL AND ii.brand <> ''), NULL),
            ', '
          ) AS brands,
          array_to_string(
            array_remove(array_agg(DISTINCT ii.product) FILTER (WHERE ii.product IS NOT NULL AND ii.product <> ''), NULL),
            ', '
          ) AS products
        FROM last_inq_rows lir
        LEFT JOIN inquiry_items ii ON ii.inquiry_id = lir.id
        GROUP BY lir.org_id
      )
      SELECT
        o.id,
        o.name,
        o.org_type,
        o.domain,
        o.country,
        o.industry,
        o.status,
        o.size_tag,
        o.source,
        o.deal_value_usd,
        o.last_contact_at,
        o.created_at,
        a.brands,
        a.products
      FROM organizations o
      LEFT JOIN agg a ON a.org_id = o.id
      WHERE (${orgType}::text IS NULL OR o.org_type = ${orgType})
      ORDER BY o.created_at DESC NULLS LAST;
    `;

    return NextResponse.json({ data: rows });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orgs
 * Тіло: { name, org_type, domain?, country? }
 * Створює нову організацію
 */
export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json();

    if (!body.name || !body.org_type) {
      return NextResponse.json(
        { error: "name and org_type are required" },
        { status: 400 }
      );
    }

    const row = await sql/*sql*/`
      insert into organizations (name, org_type, domain, country, created_at)
      values (
        ${body.name},
        ${body.org_type},
        ${body.domain || null},
        ${body.country || null},
        now()
      )
      returning id;
    `;

    return NextResponse.json({ id: row[0].id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
