export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json();

    const { org_id, summary, items } = body as {
      org_id: string;
      summary?: string;
      items?: Array<{ brand?: string; product: string; quantity?: number; unit?: string; unit_price?: number }>;
    };

    if (!org_id) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

    const inquiryId = crypto.randomUUID();
    await sql/*sql*/`
      insert into inquiries (id, org_id, summary)
      values (${inquiryId}, ${org_id}, ${summary ?? null});
    `;

    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        const itemId = crypto.randomUUID();
        await sql/*sql*/`
          insert into inquiry_items (id, inquiry_id, brand, product, quantity, unit, unit_price)
          values (
            ${itemId}, ${inquiryId},
            ${it.brand ?? null}, ${it.product},
            ${it.quantity ?? null}, ${it.unit ?? null}, ${it.unit_price ?? null}
          );
        `;
      }
    }

    // оновлюємо last_contact_at
    await sql/*sql*/`
      update organizations
      set last_contact_at = now(), updated_at = now()
      where id = ${org_id};
    `;

    return NextResponse.json({ ok: true, id: inquiryId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
