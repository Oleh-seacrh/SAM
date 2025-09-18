export async function findExistingOrg(db: any, tenantId: string, domain?: string, emails?: string[], phones?: string[]) {
  if (domain) {
    const q = await db.query(
      "select id, name, domain from organizations where tenant_id=$1 and lower(domain)=lower($2) limit 1",
      [tenantId, domain]
    );
    if (q.rows[0]) return q.rows[0];
  }
  if (emails?.length) {
    const q = await db.query(
      "select id, name, domain from organizations where tenant_id=$1 and emails && $2::text[] limit 1",
      [tenantId, emails]
    );
    if (q.rows[0]) return q.rows[0];
  }
  if (phones?.length) {
    const q = await db.query(
      "select id, name, domain from organizations where tenant_id=$1 and phones && $2::text[] limit 1",
      [tenantId, phones]
    );
    if (q.rows[0]) return q.rows[0];
  }
  return null;
}
