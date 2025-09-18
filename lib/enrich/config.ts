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
