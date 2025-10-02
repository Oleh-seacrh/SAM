export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { fetchHtml, normalizeUrl } from "@/lib/crawl/fetchHtml";
import { extractLinks, extractLinksFromSitemap } from "@/lib/crawl/extractLinks";
import { parsePage } from "@/lib/crawl/parsePage";
import { classifyPageType } from "@/lib/crawl/pageTypeLLM";
import { buildFactPool } from "@/lib/crawl/factPool";
import type { PageDescriptor, PageTypeResult } from "@/lib/types";

interface CrawlRequest {
  url: string;
  brandDict?: string[];
  limits?: {
    maxPages?: number;
    timeoutMs?: number;
  };
}

interface CrawlResponse {
  factPool: any;
  pages: (PageDescriptor & PageTypeResult)[];
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CrawlRequest = await req.json();
    const { url, brandDict = [], limits = {} } = body;

    if (!url || !url.trim()) {
      return NextResponse.json(
        { error: "Missing URL" },
        { status: 400 }
      );
    }

    const maxPages = Math.min(limits.maxPages || 8, 8);
    const domainTimeout = Math.min(limits.timeoutMs || 20000, 20000);

    const startTime = Date.now();

    // Step 1: Fetch homepage
    const homeUrl = normalizeUrl(url);
    let homeHtml: string;
    
    try {
      homeHtml = await fetchHtml(homeUrl, 5000);
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to fetch homepage: ${error.message}` },
        { status: 500 }
      );
    }

    // Step 2: Extract all links
    const extracted = extractLinks(homeHtml, homeUrl);
    let allLinks = [...extracted.links];

    // Optionally fetch sitemap links
    if (extracted.hasSitemap && extracted.sitemapUrl) {
      try {
        const sitemapLinks = await extractLinksFromSitemap(extracted.sitemapUrl, homeUrl);
        allLinks = [...allLinks, ...sitemapLinks];
      } catch {
        // Ignore sitemap errors
      }
    }

    // Deduplicate
    allLinks = Array.from(new Set(allLinks.map(normalizeUrl)));

    // Step 3: LLM classify all links (or sample) to pick best 3-7 pages
    // For simplicity, we'll use heuristic scoring based on URL patterns
    const scoredLinks = scoreLinks(allLinks, homeUrl);
    const topLinks = scoredLinks.slice(0, maxPages - 1); // -1 for homepage

    // Always include homepage
    const pagesToFetch = [homeUrl, ...topLinks.map(l => l.url)];

    // Step 4: Fetch and parse selected pages
    const fetchedPages: (PageDescriptor & PageTypeResult)[] = [];

    for (const pageUrl of pagesToFetch) {
      // Check timeout
      if (Date.now() - startTime > domainTimeout) {
        break;
      }

      try {
        const html = await fetchHtml(pageUrl, 5000);
        const descriptor = parsePage(pageUrl, html, brandDict);
        
        // Classify page type with LLM
        const classification = await classifyPageType(descriptor);
        
        fetchedPages.push({
          ...descriptor,
          ...classification,
        });
      } catch (error: any) {
        console.error(`Failed to fetch ${pageUrl}:`, error.message);
        // Continue with other pages
      }
    }

    // Step 5: Build fact pool
    const factPool = buildFactPool(fetchedPages, brandDict);

    return NextResponse.json({
      factPool,
      pages: fetchedPages,
    });

  } catch (error: any) {
    console.error("/api/crawl error:", error);
    return NextResponse.json(
      { error: error.message || "Crawl failed" },
      { status: 500 }
    );
  }
}

// Heuristic scoring for link selection
interface ScoredLink {
  url: string;
  score: number;
}

function scoreLinks(links: string[], baseUrl: string): ScoredLink[] {
  const scored: ScoredLink[] = [];

  for (const link of links) {
    if (link === baseUrl) continue; // Skip homepage (already included)

    const url = new URL(link);
    const path = url.pathname.toLowerCase();
    let score = 0;

    // Prioritize contact pages
    if (path.includes("contact")) score += 10;
    if (path.includes("about")) score += 8;
    if (path.includes("products")) score += 7;
    if (path.includes("services")) score += 6;
    if (path.includes("company")) score += 5;

    // Penalize deep paths
    const depth = path.split("/").filter(Boolean).length;
    score -= depth * 0.5;

    scored.push({ url: link, score });
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
