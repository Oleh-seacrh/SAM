// app/api/orgs/[id]/inquiries/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

const noStoreHeaders: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

/** GET /api/orgs/:id/inquiries — список інквайрів з агрегатами */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  noStore();
  try {
    const sql = getSql();
    const org_id = params?.id;
    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400, headers: noStoreHeaders });
    }

    // Агрегації за items: кількість, бренди, продукти, сумарна вартість
    const rows = await sql/*sql*/`
      SELECT
        i.id,
        i.org_id,
        i.summary,
        i.created_at,
        COALESCE(cnt.cnt, 0)::int AS items_count,
        agg.brands,
        agg.products,
        agg.deal_value_usd
      FROM inquiries i
      LEFT JOIN (
        SELECT inquiry_id, COUNT(*) AS cnt
        FROM inquiry_items
        GROUP BY inquiry_id
      ) cnt ON cnt.inquiry_id = i.id
      LEFT JOIN (
        SELECT
          inquiry_id,
          NULLIF(STRING_AGG(DISTINCT NULLIF(brand, ''), ', '), '') AS brands,
          NULLIF(STRING_AGG(DISTINCT NULLIF(product, ''), ', '), '') AS products,
          SUM(COALESCE(unit_price, 0) * COALESCE(quantity, 0))::numeric AS deal_value_usd
        FROM inquiry_items
        GROUP BY inquiry_id
      ) agg ON agg.inquiry_id = i.id
      WHERE i.org_id = ${org_id}
      ORDER BY i.created_at DESC, i.id DESC
    `;

    return NextResponse.json({ items: rows }, { headers: noStoreHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
