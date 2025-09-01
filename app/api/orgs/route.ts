// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// GET /api/orgs?org_type=client|prospect|supplier (або без фільтра)
export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);
    const t = searchParams.get("org_type");
    const orgType =
      t && ["client", "prospect", "supplier"].includes(t) ? t : null;

    let rows: any[] = [];
    if (orgType) {
      rows = await sql/*sql*/`
        with latest as (
          select i.id as inquiry_id, i.org_id, i.created_at
          from inquiries i
          join (
            select org_id, max(created_at) as m
            from inquiries
            group by org_id
          ) x on x.org_id = i.org_id and x.m = i.created_at
        )
        select
          o.id, o.name, o.org_type, o.website, o.country,
          o.last_contact_at, o.created_at,
          l.created_at as latest_inquiry_at,
          coalesce(string_agg(distinct ii.brand, ', ') filter (where ii.brand is not null), '') as brands,
          coalesce(string_agg(distinct ii.product, ', ') filter (where ii.product is not null), '') as products
        from organizations o
        left join latest l on l.org_id = o.id
        left join inquiry_items ii on ii.inquiry_id = l.inquiry_id
        where o.org_type = ${orgType}
        group by o.id, l.created_at
        order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
      `;
    } else {
      rows = await sql/*sql*/`
        with latest as (
          select i.id as inquiry_id, i.org_id, i.created_at
          from inquiries i
          join (
            select org_id, max(created_at) as m
            from inquiries
            group by org_id
          ) x on x.org_id = i.org_id and x.m = i.created_at
        )
        select
          o.id, o.name, o.org_type, o.website, o.country,
          o.last_contact_at, o.created_at,
          l.created_at as latest_inquiry_at,
          coalesce(string_agg(distinct ii.brand, ', ') filter (where ii.brand is not null), '') as brands,
          coalesce(string_agg(distinct ii.product, ', ') filter (where ii.product is not null), '') as products
        from organizations o
        left join latest l on l.org_id = o.id
        left join inquiry_items ii on ii.inquiry_id = l.inquiry_id
        group by o.id, l.created_at
        order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
      `;
    }

    return NextResponse.json({ data: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

// POST /api/orgs
export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json().catch(() => ({} as any));
    const id = crypto.randomUUID();

    const name = (body.name ?? "").trim();
    const org_type: "client" | "prospect" | "supplier" =
      ["client", "prospect", "supplier"].includes(body.org_type)
        ? body.org_type
        : "prospect";
    const website = body.website ?? null;
    const country = body.country ?? null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    await sql/*sql*/`
      insert into organizations (id, name, org_type, website, country)
      values (${id}, ${name}, ${org_type}, ${website}, ${country});
    `;

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
