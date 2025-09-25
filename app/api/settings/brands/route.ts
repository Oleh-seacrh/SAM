export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

/** Повертаємо масив рядків-брадів (до 10) */
export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  try {
    const rows = await sql/*sql*/`
      select name
      from brands
      where tenant_id = ${tenantId}
      order by lower(name) asc
      limit 50
    `;
    const brands = rows.map((r: any) => String(r.name));
    return NextResponse.json({ brands });
  } catch (e: any) {
    console.error("GET /api/settings/brands error", e);
    return NextResponse.json({ brands: [], error: "Failed to load brands" }, { status: 500 });
  }
}

/**
 * Очікуємо { brands: string[] }.
 * Проста стратегія: replace-all — видаляємо старі і вставляємо нові в одній транзакції.
 * Ліміт: максимум 10 брендів.
 */
export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let brands: string[] = Array.isArray(body?.brands) ? body.brands : [];
  // нормалізація + дедуп case-insensitive
  brands = brands
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const b of brands) {
    const key = b.toLowerCase();
    if (!seen.has(key)) { seen.add(key); uniq.push(b); }
  }
  brands = uniq.slice(0, 10); // максимум 10

  try {
    await sql.begin(async (trx: any) => {
      await trx/*sql*/`delete from brands where tenant_id = ${tenantId}`;
      if (brands.length) {
        const values = brands.map((b) => ({ tenant_id: tenantId, name: b }));
        // пакетна вставка:
        await trx`insert into brands ${trx(values)}`;
      }
    });

    return NextResponse.json({ ok: true, count: brands.length });
  } catch (e: any) {
    console.error("PUT /api/settings/brands error", e);
    return NextResponse.json({ error: "Failed to save brands" }, { status: 500 });
  }
}

// POST як синонім PUT (зручно з форм)
export async function POST(req: Request) { return PUT(req); }
