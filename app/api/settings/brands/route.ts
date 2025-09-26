// app/api/settings/brands/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

/** Нормалізація та обмеження списку брендів */
function sanitizeBrands(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  // 1) трім + toString, 2) відкидаємо порожні, 3) максимум 10, 4) унікальні (case-insensitive)
  const cleaned = arr
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .slice(0, 10);

  const seen = new Set<string>();
  const unique = cleaned.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
}

/** GET /api/settings/brands — повертає масив назв брендів для поточного tenant */
export async function GET() {
  try {
    const sql = getSql();
    const tenantId = await getTenantIdFromSession();

    if (!tenantId) {
      // Неавторизований/немає tenant — просто порожній список
      return NextResponse.json({ brands: [] });
    }

    const rows = await sql/* sql */`
      select name
      from public.brands
      where tenant_id = ${tenantId}
      order by lower(name)
      limit 100
    `;

    return NextResponse.json({ brands: rows.map((r: any) => r.name) });
  } catch (e: any) {
    console.error("GET /api/settings/brands error:", e);
    return NextResponse.json(
      { error: "Failed to load brands" },
      { status: 500 }
    );
  }
}

/** PUT /api/settings/brands — повна заміна списку брендів для поточного tenant */
export async function PUT(req: Request) {
  try {
    const sql = getSql();
    const tenantId = await getTenantIdFromSession();

    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // якщо тіло порожнє/некоректне — вважаємо, що нема брендів
      body = {};
    }

    const list = sanitizeBrands(body?.brands);

    // Проста стратегія: видалити всі старі й вставити нові в транзакції
    await sql.begin(async (trx: any) => {
      await trx/* sql */`
        delete from public.brands
        where tenant_id = ${tenantId}
      `;
      for (const name of list) {
        await trx/* sql */`
          insert into public.brands (tenant_id, name)
          values (${tenantId}, ${name})
        `;
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/settings/brands error:", e);
    const msg: string =
      typeof e?.message === "string" ? e.message : "DB upsert failed";

    // Трошки дружніші відповіді на популярні кейси
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json(
        { error: "Duplicate brand for this tenant" },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "DB upsert failed" }, { status: 500 });
  }
}

/** POST /api/settings/brands — приймаємо як синонім PUT (деякі форми шлють POST) */
export async function POST(req: Request) {
  return PUT(req);
}

/** OPTIONS — на випадок preflight (повертаємо 204) */
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
