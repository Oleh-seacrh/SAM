export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDefaultEnrichConfig, EnrichConfig } from "@/lib/enrich/config";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  try {
    const rows = await sql/*sql*/`
      select enrich_config
      from tenant_settings
      where tenant_id = ${tenantId}
      limit 1
    `;
    const cfg = rows[0]?.enrich_config ?? getDefaultEnrichConfig();
    return NextResponse.json(cfg);
  } catch {
    // якщо таблиці ще нема або інша помилка — повертаємо дефолт
    return NextResponse.json(getDefaultEnrichConfig());
  }
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  const cfg = (await req.json()) as EnrichConfig;

  await sql/*sql*/`
    insert into tenant_settings (tenant_id, enrich_config)
    values (${tenantId}, ${cfg}::jsonb)
    on conflict (tenant_id) do update
      set enrich_config = excluded.enrich_config,
          updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
