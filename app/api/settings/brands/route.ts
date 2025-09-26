export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

/**
 * GET  /api/settings/brands
 * Повертає масив рядків брендів для поточного tenant.
 */
export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  try {
    const rows = await sql/*sql*/`
      select name
      from brands
      where tenant_id = ${tenantId}
      order by lower(name) asc
    `;
    const brands: string[] = rows.map((r: any) => r.name);
    return NextResponse.json({ brands });
  } catch (e) {
    console.error("GET /api/settings/brands error", e);
    // Не ламаємо UI — повертаємо порожній список
    return NextResponse.json({ brands: [] });
  }
}

/**
 * PUT  /api/settings/brands
 * Body: { brands: string[] } (до 10)
 * Стратегія: повністю замінюємо список — в транзакції:
 *   DELETE ... WHERE tenant_id = ?
 *   INSERT ... (по одному рядку)
 */
export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw: string[] = Array.isArray(body?.brands) ? body.brands : [];
  // нормалізація
  let brands = raw
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  // дедуп по нижньому регістру, але зберігаємо першу “красиву” форму
  const seen = new Set<string>();
  brands = brands.filter((b) => {
    const key = b.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  try {
    await sql.begin(async (trx: any) => {
      await trx/*sql*/`
        delete from brands
        where tenant_id = ${tenantId}
      `;

      for (const name of brands) {
        await trx/*sql*/`
          insert into brands (tenant_id, name)
          values (${tenantId}, ${name})
        `;
      }
    });

    return NextResponse.json({ ok: true, brands });
  } catch (e: any) {
    console.error("PUT /api/settings/brands error", e?.message || e);
    // Якщо знову зловили унікальність — скажемо користувачу по-людськи
    const msg =
      (typeof e?.message === "string" && e.message.includes("duplicate")) ?
      "Duplicate brand for this tenant" :
      "DB upsert failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST як синонім PUT */
export async function POST(req: Request) {
  return PUT(req);
}
