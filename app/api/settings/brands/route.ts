// app/api/settings/brands/route.ts
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
    return NextResponse.json({ brands: [] });
  }
  const rows = await sql/*sql*/`
    select name
    from public.brands
    where tenant_id = ${tenantId}
    order by lower(name)
    limit 100
  `;
  return NextResponse.json({ brands: rows.map((r:any)=>r.name) });
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  let brands: string[] = Array.isArray(body?.brands) ? body.brands : [];

  // санітизація
  brands = brands
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  // робимо сет без дублікатів (case-insensitive)
  const seen = new Set<string>();
  const list = brands.filter((b) => {
    const key = b.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // апдейт як «повна заміна»: видалити старі → вставити нові
  await sql.begin(async (trx:any) => {
    await trx/*sql*/`delete from public.brands where tenant_id = ${tenantId}`;
    for (const name of list) {
      await trx/*sql*/`
        insert into public.brands (tenant_id, name)
        values (${tenantId}, ${name})
      `;
    }
  });

  return NextResponse.json({ ok: true });
}
