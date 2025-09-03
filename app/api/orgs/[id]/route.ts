import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db"; // <- тільки getSql тут достатньо

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sql = getSql();         // один клієнт на весь обробник
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // 1) організація
    const orgRows = (await sql/*sql*/`
      select
        id,
        name,
        org_type,
        domain,
        country,
        last_contact_at,
        created_at
      from public.organizations
      where id = ${id}
      limit 1;
    `) as any[];

    const org = orgRows?.[0];
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 2) заявки
    let inquiries: any[] = [];
    try {
      inquiries = (await sql/*sql*/`
        select id, summary, created_at
        from public.inquiries
        where org_id = ${id}
        order by created_at desc;
      `) as any[];
    } catch (e) {
      console.error("GET inquiries failed:", e);
      inquiries = [];
    }

    // 3) позиції — БЕЗ масивів/ANY, беремо через JOIN (надійно)
    const items: Record<string, any[]> = {};
    if (inquiries.length) {
      try {
        const rows = (await sql/*sql*/`
          select
            ii.inquiry_id,
            ii.id,
            ii.brand,
            ii.product,
            ii.quantity,
            ii.unit,
            ii.unit_price,
            ii.created_at
          from public.inquiry_items ii
          join public.inquiries iq on iq.id = ii.inquiry_id
          where iq.org_id = ${id}
          order by ii.created_at desc;
        `) as any[];

        for (const r of rows) {
          (items[r.inquiry_id] ??= []).push(r);
        }
      } catch (e) {
        console.error("GET inquiry_items failed:", e);
      }
    }

    return NextResponse.json({ org, inquiries, items });
  } catch (e: any) {
    console.error("GET /api/orgs/[id] failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
