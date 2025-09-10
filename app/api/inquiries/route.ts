// app/api/inquiries/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

/**
 * POST /api/inquiries
 * Body:
 * {
 *   org_id: string,
 *   summary?: string,
 *   items?: Array<{ brand?: string; product: string; quantity?: number; unit?: string; unit_price?: number; }>
 * }
 *
 * Створює заявку та (опційно) позиції. Оновлює organizations.last_contact_at.
 * Повертає створений рядок inquiries (id, org_id, summary, created_at).
 */
export async function POST(req: NextRequest) {
  noStore(); // вимкнути кеш для цього запиту
  try {
    const sql = getSql();
    const body = await req.json().catch(() => ({} as any));

    const rawOrgId = body?.org_id;
    const org_id = typeof rawOrgId === "string" ? rawOrgId : String(rawOrgId || "");
    const summary: string | null = body?.summary ?? null;
    const items: Array<{
      brand?: string | null;
      product?: string | null;
      quantity?: number | null;
      unit?: string | null;
      unit_price?: number | null;
    }> = Array.isArray(body?.items) ? body.items : [];

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400, headers: noStoreHeaders });
    }

    // створюємо заявку і одразу отримуємо створений рядок
    const inquiryId = crypto.randomUUID();
    const { rows: created } = await sql/*sql*/`
      INSERT INTO inquiries (id, org_id, summary, created_at)
      VALUES (${inquiryId}, ${org_id}, ${summary}, NOW())
      RETURNING id, org_id, summary, created_at
    `;

    // створюємо позиції, якщо є
    if (items.length) {
      for (const it of items) {
        const itemId = crypto.randomUUID();
        await sql/*sql*/`
          INSERT INTO inquiry_items (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at)
          VALUES (
            ${itemId},
            ${inquiryId},
            ${it?.brand ?? null},
            ${it?.product ?? null},
            ${typeof it?.quantity === "number" ? it.quantity : null},
            ${it?.unit ?? null},
            ${typeof it?.unit_price === "number" ? it.unit_price : null},
            NOW()
          )
        `;
      }
    }

    // оновлюємо last_contact_at
    await sql/*sql*/`
      UPDATE organizations
      SET last_contact_at = NOW()
      WHERE id = ${org_id}
    `;

    // повертаємо створений рядок (стабільний для optimistic UI/сортування)
    const data =
      created?.[0] ??
      ({ id: inquiryId, org_id, summary, created_at: new Date().toISOString() } as const);

    return NextResponse.json(data, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

const noStoreHeaders: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};
