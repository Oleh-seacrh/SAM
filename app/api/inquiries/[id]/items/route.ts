// app/api/inquiries/[id]/items/route.ts
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

/** GET list of items for a given inquiry */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  noStore();
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noStoreHeaders });
    }

    // стабільний порядок для відображення (спершу старіші)
    const items = await sql/*sql*/`
      select id, inquiry_id, brand, product, quantity, unit, unit_price, created_at
      from inquiry_items
      where inquiry_id = ${id}
      order by created_at asc, id asc;
    `;

    return NextResponse.json({ items }, { headers: noStoreHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

/** POST add one or many items to an inquiry */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  noStore();
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noStoreHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const list = Array.isArray(body?.items) ? body.items : (body ? [body] : []);
    if (!list.length) {
      return NextResponse.json({ error: "No items provided" }, { status: 400, headers: noStoreHeaders });
    }

    const created: string[] = [];
    for (const it of list) {
      const itemId = crypto.randomUUID();
      await sql/*sql*/`
        insert into inquiry_items (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at)
        values (
          ${itemId},
          ${id},
          ${it?.brand ?? null},
          ${it?.product ?? null},
          ${typeof it?.quantity === "number" ? it.quantity : null},
          ${it?.unit ?? null},
          ${typeof it?.unit_price === "number" ? it.unit_price : null},
          now()
        );
      `;
      created.push(itemId);
    }

    return NextResponse.json({ ok: true, ids: created }, { headers: noStoreHeaders });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
