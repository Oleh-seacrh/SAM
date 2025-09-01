// app/api/orgs/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/**
 * GET /api/orgs/:id
 * Повертає:
 *  - org: дані організації
 *  - inquiries: список заявок (останнє зверху)
 *  - items: map { inquiry_id -> масив позицій }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    const id = params.id;

    const org = (await sql/*sql*/`
      select id, name, org_type, website, country, last_contact_at, created_at
      from organizations
      where id = ${id}
      limit 1;
    ` as any)[0];

    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inquiries = await sql/*sql*/`
      select id, summary, created_at
      from inquiries
      where org_id = ${id}
      order by created_at desc;
    ` as any;

    let items: Record<string, any[]> = {};
    if (inquiries.length) {
      const ids = inquiries.map((r: any) => r.id);
      const rows = await sql/*sql*/`
        select
          inquiry_id,
          id,
          brand,
          product,
          quantity,
          unit,
          unit_price,
          created_at
        from inquiry_items
        where inquiry_id = any(${ids});
      ` as any;

      for (const r of rows) {
        (items[r.inquiry_id] ??= []).push(r);
      }
    }

    return NextResponse.json({ org, inquiries, items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orgs/:id
 * Видаляє організацію (каскад залежить від схеми; якщо FK без cascade,
 * і є пов’язані записи, Postgres кине помилку).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();
    await sql/*sql*/`
      delete from organizations
      where id = ${params.id};
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
