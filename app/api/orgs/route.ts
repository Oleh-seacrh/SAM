// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const { searchParams } = new URL(req.url);
    const orgType = searchParams.get("org_type"); // client|prospect|supplier|null

    const rows = await sql/*sql*/`
      select
        o.id, o.name, o.org_type, o.website, o.country, o.last_contact_at, o.created_at
      from organizations o
      where (${orgType} is null or o.org_type = ${orgType})
      order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
    ` as any;

    return NextResponse.json({ data: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json().catch(() => ({}));
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
