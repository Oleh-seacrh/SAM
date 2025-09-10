import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  noStore(); // повністю відрубити кеш цього хендлера

  const org_id = ctx.params.id;
  if (!org_id) {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  const { rows } = await sql/*sql*/`
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
        SUM(COALESCE(unit_price,0) * COALESCE(quantity,0))::numeric AS deal_value_usd
      FROM inquiry_items
      GROUP BY inquiry_id
    ) agg ON agg.inquiry_id = i.id
    WHERE i.org_id = ${org_id}
    ORDER BY i.created_at DESC, i.id DESC
  `;

  return NextResponse.json(
    { items: rows },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        "Pragma": "no-cache",
      },
    }
  );
}
