import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  const orgs = await sql/*sql*/`select * from organizations where id = ${id} limit 1;` as any;
  if (orgs.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Повна історія заявок з позиціями
  const inquiries = await sql/*sql*/`
    select i.id, i.summary, i.created_at
    from inquiries i
    where i.org_id = ${id}
    order by i.created_at desc;
  ` as any;

  let items: Record<string, any[]> = {};
  if (inquiries.length > 0) {
    const ids = inquiries.map((r: any) => r.id);
    const rows = await sql/*sql*/`
      select inquiry_id, id, brand, product, quantity, unit, unit_price, created_at
      from inquiry_items
      where inquiry_id = any(${ids});
    ` as any;
    for (const r of rows) {
      if (!items[r.inquiry_id]) items[r.inquiry_id] = [];
      items[r.inquiry_id].push(r);
    }
  }

  return NextResponse.json({ org: orgs[0], inquiries, items });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  await sql/*sql*/`delete from organizations where id = ${id};`;
  return NextResponse.json({ ok: true });
}
