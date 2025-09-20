export type EnrichConfig = {
  enrichBy: { website: boolean; email: boolean; phone: boolean };
  sources: {
    web: boolean;
    platforms: { alibaba: boolean; madeInChina: boolean; indiamart: boolean };
    socials: { linkedin: boolean; facebook: boolean; instagram: boolean };
  };
  strictMatching: boolean;
  timeBudgetMs: number;
  perSourceTimeoutMs: { site: number; web: number; linkedin: number; platforms: number };
};

export function getDefaultEnrichConfig(): EnrichConfig {
  return {
    enrichBy: { website: true, email: true, phone: false },
    sources: {
      web: true,
      platforms: { alibaba: true, madeInChina: false, indiamart: false },
      socials: { linkedin: true, facebook: false, instagram: false }
    },
    strictMatching: true,
    timeBudgetMs: 12000,
    perSourceTimeoutMs: { site: 3000, web: 2000, linkedin: 2000, platforms: 3000 }
  };
}

/**
 * Helper function to load enrich config for a tenant.
 * Loads from tenant_settings or falls back to default config.
 */
export async function loadTenantEnrichConfig(sql: any, tenantId: string): Promise<EnrichConfig> {
  let cfg: EnrichConfig = getDefaultEnrichConfig();
  try {
    const rows = await sql/*sql*/`select enrich_config from tenant_settings where tenant_id = ${tenantId} limit 1`;
    cfg = rows[0]?.enrich_config ?? cfg;
  } catch {
    // ignore errors and use default config
  }
  return cfg;
}
