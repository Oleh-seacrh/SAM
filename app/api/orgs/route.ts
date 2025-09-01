import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orgType = searchParams.get("org_type"); // client|prospect|supplier|null (усі)

  // Отримуємо організації + прев’ю останньої заявки (бренди/продукти)
  const rows = await sql/*sql*/`
    with latest as (
      select
        i.id as inquiry_id,
        i.org_id,
        i.created_at
      from inquiries i
      join (
        select org_id, max(created_at) as max_created
        from inquiries
        group by org_id
      ) m on m.org_id = i.org_id and m.max_created = i.created_at
    )
    select
      o.id, o.name, o.org_type, o.website, o.country, o.last_contact_at, o.created_at,
      l.created_at as latest_inquiry_at,
      coalesce(string_agg(distinct ii.brand, ', ') filter (where ii.brand is not null), '') as brands,
      coalesce(string_agg(distinct ii.product, ', ') filter (where ii.product is not null), '') as products
    from organizations o
    left join latest l on l.org_id = o.id
    left join inquiry_items ii on ii.inquiry_id = l.inquiry_id
    where (${orgType} is null or o.org_type = ${orgType})
    group by o.id, l.created_at
    order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
  ` as any;

  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = crypto.randomUUID();

  const name = (body.name ?? "").trim();
  const org_type = body.org_type ?? "prospect";
  const website = body.website ?? null;
  const country = body.country ?? null;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!["client", "prospect", "supplier"].includes(org_type)) {
    return NextResponse.json({ error: "org_type must be client|prospect|supplier" }, { status: 400 });
  }

  await sql/*sql*/`
    insert into organizations (id, name, org_type, website, country)
    values (${id}, ${name}, ${org_type}, ${website}, ${country});
  `;

  return NextResponse.json({ ok: true, id });
}
