// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// GET /api/orgs?org_type=client|prospect|supplier (або без фільтра)
export async function GET(req: NextRequest) {
  try {
    const sql = getSql();

    const { searchParams } = new URL(req.url);
    const orgTypeRaw = searchParams.get("org_type");
    const orgType =
      orgTypeRaw && ["client", "prospect", "supplier"].includes(orgTypeRaw)
        ? (orgTypeRaw as "client" | "prospect" | "supplier")
        : null;

    let rows: any[] = [];
    if (orgType) {
      rows = await sql/*sql*/`
        select
          o.id,
          o.name,
          o.org_type,
          o.website,
          o.country,
          o.last_contact_at,
          o.created_at
        from organizations o
        where o.org_type = ${orgType}
        order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
      `;
    } else {
      rows = await sql/*sql*/`
        select
          o.id,
          o.name,
          o.org_type,
          o.website,
          o.country,
          o.last_contact_at,
          o.created_at
        from organizations o
        order by coalesce(o.last_contact_at, o.created_at) desc nulls last;
      `;
    }

    return NextResponse.json({ data: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

// POST /api/orgs  (створення організації)
// body: { name: string, org_type?: "client"|"prospect"|"supplier", website?: string|null, country?: string|null }
export async function POST(req: NextRequest) {
  try {
    const sql = getSql();

    const body = await req.json().catch(() => ({} as any));
    const id = crypto.randomUUID();

    const name = (body.name ?? "").trim();
    const org_type: "client" | "prospect" | "supplier" =
      ["client", "prospect", "supplier"].includes(body.org_type) ? body.org_type : "prospect";
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
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
