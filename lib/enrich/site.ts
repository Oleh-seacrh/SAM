export type SiteResult = {
  domain: string;
  companyName?: string;
  emails?: string[];
  phones?: string[];
  countryIso2?: string;
  products?: string[];
  rawUrls?: string[];
};

export async function fetchSite(domain: string, timeoutMs: number): Promise<SiteResult | null> {
  // TODO: fetch(`https://${domain}`) + парс HTML/метаданих
  return { domain, companyName: undefined, emails: [], phones: [], rawUrls: [] };
}
