// lib/auth.ts
export async function getTenantIdFromSession(): Promise<string> {
  // single-tenant заглушка; за бажанням заміниш на реальну сесію
  return process.env.TENANT_ID ?? "00000000-0000-0000-0000-000000000000";
}
