// app/api/orgs/[id]/inquiries/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/**
 * GET /api/orgs/:id/inquiries
 * Optional query: limit, offset
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // summary rows for the org's inquiries
    const rows = await sql/*sql*/`
      select
        i.id,
        i.org_id,
        i.summary,
        i.created_at,
        count(ii.id)::int as items_count,
        string_agg(distinct nullif(ii.brand, ''), ', ') filter (where ii.brand is not null and ii.brand <> '') as brands,
        string_agg(distinct nullif(ii.product, ''), ', ') filter (where ii.product is not null and ii.product <> '') as products,
        sum(coalesce(ii.quantity,0) * coalesce(ii.unit_price,0)) as deal_value_usd
      from inquiries i
      left join inquiry_items ii on ii.inquiry_id = i.id
      where i.org_id = ${id}
      group by i.id
      order by i.created_at desc
      limit 100;
    `;

    return NextResponse.json({ items: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
