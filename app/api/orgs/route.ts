// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/**
 * GET /api/orgs?org_type=client|prospect|supplier
 * Повертає список організацій з прев’ю (останній inquiry: brands/products, latest_inquiry_at)
 */
export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);
    const orgType = searchParams.get("org_type") as
      | "client"
      | "prospect"
      | "supplier"
      | null;

    let rows;
    if (orgType) {
      rows = await sql/*sql*/`
        select
          o.id,
          o.name,
          o.org_type,
          o.domain,
          o.country,
          o.last_contact_at,
          o.created_at,
          i.created_at as latest_inquiry_at,
          string_agg(distinct ii.brand, ', ')  filter (where ii.brand   is not null) as brands,
          string_agg(distinct ii.product, ', ') filter (where ii.product is not null) as products
        from organizations o
        left join inquiries i     on i.org_id     = o.id
        left join inquiry_items ii on ii.inquiry_id = i.id
        where o.org_type = ${orgType}
        group by o.id, i.created_at
        order by o.created_at desc;
      `;
    } else {
      rows = await sql/*sql*/`
        select
          o.id,
          o.name,
          o.org_type,
          o.domain,
          o.country,
          o.last_contact_at,
          o.created_at,
          i.created_at as latest_inquiry_at,
          string_agg(distinct ii.brand, ', ')  filter (where ii.brand   is not null) as brands,
          string_agg(distinct ii.product, ', ') filter (where ii.product is not null) as products
        from organizations o
        left join inquiries i     on i.org_id     = o.id
        left join inquiry_items ii on ii.inquiry_id = i.id
        group by o.id, i.created_at
        order by o.created_at desc;
      `;
    }

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
