export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// один-до-одного м’яка санітизація
function cleanBrands(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;   // дублікат у тілі запиту
    seen.add(key);
    out.push(s);
    if (out.length >= 10) break;
  }
  return out;
}

// GET: віддаємо простий масив назв
export async function GET() {
  try {
    const sql = getSql();
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return NextResponse.json({ brands: [] });

    const rows = await sql/*sql*/`
      select name
      from public.brands
      where tenant_id = ${tenantId}
      order by lower(name)
      limit 100
    `;
    return NextResponse.json({ brands: rows.map((r: any) => r.name) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// PUT: “повна заміна” — як у простих формах
export async function PUT(req: Request) {
  try {
    const sql = getSql();
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch {}
    const list = cleanBrands(body?.brands);

    // простий підхід як у Organization: спочатку видаляємо все під tenant
    await sql/*sql*/`delete from public.brands where tenant_id = ${tenantId}`;

    // потім вставляємо по одному
    for (const name of list) {
      await sql/*sql*/`
        insert into public.brands (tenant_id, name)
        values (${tenantId}, ${name})
        on conflict do nothing
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // покажемо точну помилку, щоб не було «DB upsert failed» без деталей
    const msg = String(e?.message ?? e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// опційно, якщо клік “Save” десь стріляє POST — просто прокинемо на PUT
export async function POST(req: Request) {
  return PUT(req);
}
