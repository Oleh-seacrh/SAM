import { NextResponse } from "next/server";
import { getDefaultEnrichConfig, EnrichConfig } from "@/lib/enrich/config";
import { db } from "@/lib/db"; // твій клієнт Neon
import { getTenantIdFromSession } from "@/lib/auth"; // припущення

export async function GET() {
  const tenantId = await getTenantIdFromSession();
  const row = await db.query("select enrich_config from tenant_settings where tenant_id = $1", [tenantId]);
  const cfg = row?.rows?.[0]?.enrich_config ?? getDefaultEnrichConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: Request) {
  const tenantId = await getTenantIdFromSession();
  const cfg = (await req.json()) as EnrichConfig;
  await db.query(`
    insert into tenant_settings (tenant_id, enrich_config)
    values ($1, $2)
    on conflict (tenant_id) do update set enrich_config = excluded.enrich_config
  `, [tenantId, cfg]);
  return NextResponse.json({ ok: true });
}
