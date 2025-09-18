import crypto from "crypto";
import { getSql } from "@/lib/db";

export const inputHash = (s: string) =>
  crypto.createHash("sha1").update(s).digest("hex");

export async function getFromCache(tenantId: string, raw: string) {
  const sql = getSql();
  const h = inputHash(raw);
  const rows = await sql/*sql*/`
    select result from enrichment_cache
    where tenant_id = ${tenantId} and input_hash = ${h}
    limit 1
  `;
  return rows[0]?.result ?? null;
}

export async function saveToCache(tenantId: string, raw: string, result: any) {
  const sql = getSql();
  const h = inputHash(raw);
  await sql/*sql*/`
    insert into enrichment_cache (tenant_id, input_hash, result)
    values (${tenantId}, ${h}, ${result}::jsonb)
    on conflict (tenant_id, input_hash) do update set result = excluded.result
  `;
}
