export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parsePage, findContactPages } from "@/lib/crawl/parsePage";
import { createFactPool, addPageToPool, hasEnoughInfo, FactPool } from "@/lib/crawl/factPool";

type CrawlItem = {
  homepage: string;
  domain: string;
};

type CrawlRequest = {
  items: CrawlItem[];
  maxPagesPerSite?: number;
};

type CrawlResult = {
  domain: string;
  emails: string[];
  phones: string[];
  pagesAnalyzed: number;
  contactFound: boolean;
};

/**
 * Crawl a single site to find contact information
 */
async function crawlSite(homepage: string, domain: string, maxPages = 7): Promise<CrawlResult> {
  let pool = createFactPool(domain);
  const visitedUrls = new Set<string>();
  
  try {
    // 1. Parse homepage
    const homePage = await parsePage(homepage);
    if (homePage) {
      pool = addPageToPool(pool, homePage);
      visitedUrls.add(homepage);
      
      // Check if we already have enough info
      if (hasEnoughInfo(pool)) {
        return {
          domain,
          emails: pool.emails,
          phones: pool.phones,
          pagesAnalyzed: pool.pagesAnalyzed,
          contactFound: pool.contactPageFound || pool.aboutPageFound,
        };
      }
      
      // 2. Find contact/about pages from homepage links
      const candidatePages = findContactPages(homePage.links);
      
      // 3. Crawl up to maxPages-1 additional pages
      for (const url of candidatePages) {
        if (visitedUrls.size >= maxPages) break;
        if (visitedUrls.has(url)) continue;
        
        const page = await parsePage(url);
        if (page) {
          pool = addPageToPool(pool, page);
          visitedUrls.add(url);
          
          // Stop early if we have enough info
          if (hasEnoughInfo(pool)) break;
        }
      }
      
      // 4. If still not enough, crawl a few more random links
      if (!hasEnoughInfo(pool) && visitedUrls.size < maxPages) {
        const remainingLinks = homePage.links.filter(l => !visitedUrls.has(l));
        const additionalLinks = remainingLinks.slice(0, maxPages - visitedUrls.size);
        
        for (const url of additionalLinks) {
          if (visitedUrls.size >= maxPages) break;
          
          const page = await parsePage(url);
          if (page) {
            pool = addPageToPool(pool, page);
            visitedUrls.add(url);
            
            if (hasEnoughInfo(pool)) break;
          }
        }
      }
    }
  } catch (e) {
    console.error(`Error crawling ${domain}:`, e);
  }
  
  return {
    domain,
    emails: pool.emails,
    phones: pool.phones,
    pagesAnalyzed: pool.pagesAnalyzed,
    contactFound: pool.contactPageFound || pool.aboutPageFound,
  };
}

/**
 * POST /api/crawl
 * Crawl multiple sites to find contact information
 */
export async function POST(req: NextRequest) {
  try {
    const { items, maxPagesPerSite = 7 }: CrawlRequest = await req.json();
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No items to crawl" },
        { status: 400 }
      );
    }
    
    // Limit number of sites to crawl
    const limitedItems = items.slice(0, 10);
    
    // Crawl all sites in parallel
    const results = await Promise.all(
      limitedItems.map(item => 
        crawlSite(item.homepage, item.domain, maxPagesPerSite)
      )
    );
    
    // Convert to a map by domain
    const resultsByDomain: Record<string, CrawlResult> = {};
    for (const result of results) {
      resultsByDomain[result.domain] = result;
    }
    
    return NextResponse.json({ results: resultsByDomain });
  } catch (e: any) {
    console.error("/api/crawl error:", e);
    return NextResponse.json(
      { error: e?.message || "Crawl failed" },
      { status: 500 }
    );
  }
}
