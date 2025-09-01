// app/api/inquiries/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

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
 */
export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json();

    const org_id = String(body?.org_id || "");
    const summary = body?.summary ?? null;
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    // створюємо заявку
    const inquiryId = crypto.randomUUID();
    await sql/*sql*/`
      insert into inquiries (id, org_id, summary, created_at)
      values (${inquiryId}, ${org_id}, ${summary}, now());
    `;

    // створюємо позиції, якщо є
    if (items.length) {
      for (const it of items) {
        const itemId = crypto.randomUUID();
        await sql/*sql*/`
          insert into inquiry_items (id, inquiry_id, brand, product, quantity, unit, unit_price, created_at)
          values (
            ${itemId},
            ${inquiryId},
            ${it?.brand ?? null},
            ${it?.product ?? null},
            ${typeof it?.quantity === "number" ? it.quantity : null},
            ${it?.unit ?? null},
            ${typeof it?.unit_price === "number" ? it.unit_price : null},
            now()
          );
        `;
      }
    }

    // оновлюємо last_contact_at
    await sql/*sql*/`
      update organizations
      set last_contact_at = now()
      where id = ${org_id};
    `;

    return NextResponse.json({ ok: true, id: inquiryId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
