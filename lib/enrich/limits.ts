import { getSql } from "@/lib/db";

export async function canRunEnrichToday(tenantId: string, maxPerDay: number) {
  const sql = getSql();
  const rows = await sql/*sql*/`
    select count(*)::int as c
    from enrichment_logs
    where tenant_id = ${tenantId}
      and created_at >= now() - interval '1 day'
  `;
  return (rows[0]?.c ?? 0) < maxPerDay;
}
