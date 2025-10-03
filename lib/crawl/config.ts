// lib/crawl/config.ts
// Crawl profile configurations

export interface CrawlProfile {
  maxPages: number;
  maxDepth: number;
  pageTimeoutMs: number;
  domainTimeoutMs: number;
  renderedFallback: boolean;
  retries?: number;
}

export const CRAWL_PROFILES: Record<"quick" | "deep", CrawlProfile> = {
  quick: {
    maxPages: 1,
    maxDepth: 0,
    pageTimeoutMs: 5000,
    domainTimeoutMs: 15000,
    renderedFallback: false,
  },
  deep: {
    maxPages: 25,
    maxDepth: 2,
    pageTimeoutMs: 10000,
    domainTimeoutMs: 60000,
    renderedFallback: true,
    retries: 2,
  },
};
