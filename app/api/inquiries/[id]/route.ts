// app/api/inquiries/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/** GET inquiry with items */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const inquiry = (await sql/*sql*/`
      select id, org_id, summary, created_at
      from inquiries
      where id = ${id}
      limit 1;
    ` as any)[0];

    if (!inquiry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const items = await sql/*sql*/`
      select id, inquiry_id, brand, product, quantity, unit, unit_price, created_at
      from inquiry_items
      where inquiry_id = ${id}
      order by created_at asc;
    `;

    return NextResponse.json({ inquiry, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/** DELETE inquiry and its items */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await sql/*sql*/`delete from inquiry_items where inquiry_id = ${id};`;
    await sql/*sql*/`delete from inquiries where id = ${id};`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
