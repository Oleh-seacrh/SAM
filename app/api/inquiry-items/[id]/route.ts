// app/api/inquiry-items/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/** PATCH update single inquiry item fields */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const body = await req.json().catch(() => ({}));

    // Only allow specific fields
    const fields: any = {
      brand: typeof body.brand === "string" ? body.brand : undefined,
      product: typeof body.product === "string" ? body.product : undefined,
      unit: typeof body.unit === "string" ? body.unit : undefined,
    };
    if (typeof body.quantity === "number") fields.quantity = body.quantity;
    if (typeof body.unit_price === "number") fields.unit_price = body.unit_price;

    const keys = Object.keys(fields);
    if (!keys.length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Build dynamic set clause
    const sets = keys.map((k, idx) => `${k} = $${idx + 2}`).join(", ");
    const values = [id, ...keys.map(k => (fields as any)[k])];

    await (sql as any)(`update inquiry_items set ${sets} where id = $1`, values);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/** DELETE single inquiry item */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = getSql();
    await sql/*sql*/`delete from inquiry_items where id = ${params.id};`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
