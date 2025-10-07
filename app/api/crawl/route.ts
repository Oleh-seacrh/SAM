export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getTenantIdFromSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { parsePage, PageData } from "@/lib/crawl/parsePage";
import { matchBrands } from "@/lib/crawl/factPool";
import { CountryDetection } from "@/lib/country";

/* ==================================================
 * Types
 * ================================================== */
interface CrawlRequest {
  url: string;
  domain: string;
  maxPages?: number;
}

interface CrawlResult {
  url: string;
  domain: string;
  pagesAnalyzed: number;
  contacts: {
    emails: string[];
    phones: string[];
  };
  detectedBrands: string[];
  country: {
    iso2: string | null;
    confidence: "HIGH" | "WEAK" | null;
    confidenceScore: number;
  };
}

/* ==================================================
 * Fetch page content
 * ================================================== */
async function fetchPage(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    if (!r.ok) return "";
    return await r.text();
  } catch (e: any) {
    console.warn("fetchPage failed:", url, e?.message);
    return "";
  } finally {
    clearTimeout(id);
  }
}

/* ==================================================
 * Find key pages to crawl
 * ================================================== */
function findKeyPages(baseUrl: string, html: string): string[] {
  const pages: Set<string> = new Set();
  
  // Add base URL
  pages.add(baseUrl);
  
  // Extract domain
  const domain = new URL(baseUrl).origin;
  
  // Find links that might contain contact or about info
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  const matches = html.matchAll(linkRegex);
  
  const keywords = [
    "contact", "about", "company", "impressum", "imprint",
    "about-us", "aboutus", "kontakt", "uber-uns", "ueber-uns",
  ];
  
  for (const match of matches) {
    let href = match[1];
    if (!href) continue;
    
    // Skip external links, anchors, javascript, mailto, tel
    if (href.startsWith("#") || href.startsWith("javascript:") || 
        href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    
    // Convert relative URLs to absolute
    if (href.startsWith("/")) {
      href = domain + href;
    } else if (!href.startsWith("http")) {
      href = domain + "/" + href;
    }
    
    // Only same domain
    try {
      const hrefUrl = new URL(href);
      if (hrefUrl.origin !== domain) continue;
    } catch {
      continue;
    }
    
    // Check if URL contains keywords
    const lowerHref = href.toLowerCase();
    if (keywords.some(kw => lowerHref.includes(kw))) {
      pages.add(href);
    }
  }
  
  return Array.from(pages).slice(0, 5); // Limit to 5 pages
}

/* ==================================================
 * Main crawl logic
 * ================================================== */
async function crawlDomain(
  url: string,
  domain: string,
  brandDict: string[],
  maxPages: number = 3
): Promise<CrawlResult> {
  const pagesToCrawl: string[] = [url];
  const crawledPages: PageData[] = [];
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const allBrands = new Set<string>();
  const countryDetections: CountryDetection[] = [];
  
  // Fetch homepage first
  let html = await fetchPage(url);
  if (html) {
    crawledPages.push({ url, html });
    
    // Find additional pages to crawl
    const keyPages = findKeyPages(url, html);
    for (const page of keyPages) {
      if (!pagesToCrawl.includes(page)) {
        pagesToCrawl.push(page);
      }
    }
  }
  
  // Crawl additional pages (up to maxPages total)
  for (let i = 1; i < pagesToCrawl.length && i < maxPages; i++) {
    const pageUrl = pagesToCrawl[i];
    const pageHtml = await fetchPage(pageUrl);
    if (pageHtml) {
      crawledPages.push({ url: pageUrl, html: pageHtml });
    }
  }
  
  // Parse all crawled pages
  for (const page of crawledPages) {
    const parsed = await parsePage(page);
    
    // Collect contacts
    parsed.contacts.emails.forEach(e => allEmails.add(e));
    parsed.contacts.phones.forEach(p => allPhones.add(p));
    
    // Detect country
    if (parsed.country) {
      countryDetections.push(parsed.country);
    }
    
    // Match brands
    const brands = matchBrands(parsed.textContent, brandDict);
    brands.forEach(b => allBrands.add(b));
  }
  
  // Combine country detections (highest confidence wins)
  const bestCountry = countryDetections.length > 0
    ? countryDetections.reduce((best, curr) =>
        curr.confidenceScore > best.confidenceScore ? curr : best
      )
    : null;
  
  return {
    url,
    domain,
    pagesAnalyzed: crawledPages.length,
    contacts: {
      emails: Array.from(allEmails),
      phones: Array.from(allPhones),
    },
    detectedBrands: Array.from(allBrands),
    country: {
      iso2: bestCountry?.iso2 || null,
      confidence: bestCountry?.confidence || null,
      confidenceScore: bestCountry?.confidenceScore || 0,
    },
  };
}

/* ==================================================
 * API Route
 * ================================================== */
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 401 });
    }
    
    const body: CrawlRequest = await req.json();
    const { url, domain, maxPages = 3 } = body;
    
    if (!url || !domain) {
      return NextResponse.json(
        { error: "Missing url or domain" },
        { status: 400 }
      );
    }
    
    // Get brand dictionary from tenant_settings
    const sql = getSql();
    const rows = await sql/*sql*/`
      select name
      from public.brands
      where tenant_id = ${tenantId}
      order by lower(name)
      limit 100
    `;
    const brandDict = rows.map((r: any) => r.name);
    
    // Perform crawl
    const result = await crawlDomain(url, domain, brandDict, maxPages);
    
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/crawl error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Crawl failed" },
      { status: 500 }
    );
  }
}
