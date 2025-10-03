export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getTenantIdFromSession } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { parsePage, PageData } from "@/lib/crawl/parsePage";
import { matchBrands } from "@/lib/crawl/factPool";
import { CountryDetection } from "@/lib/country";
import { CRAWL_PROFILES } from "@/lib/crawl/config";

/* ==================================================
 * Types
 * ================================================== */
interface CrawlRequest {
  url: string;
  domain: string;
  maxPages?: number;
  profile?: "quick" | "deep";
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
  companyType?: string;
  evidence?: string[];
}

// Request deduplication cache: requestId -> timestamp
const requestCache = new Map<string, number>();
const CACHE_TTL_MS = 60000; // 60 seconds

/* ==================================================
 * Fetch page content with retry support
 * ================================================== */
async function fetchPage(
  url: string,
  timeoutMs = 8000,
  retries = 0
): Promise<string> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      
      clearTimeout(id);
      if (!r.ok) {
        lastError = new Error(`HTTP ${r.status}`);
        continue;
      }
      return await r.text();
    } catch (e: any) {
      lastError = e;
      clearTimeout(id);
      if (attempt < retries) {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.warn("fetchPage failed after retries:", url, lastError?.message);
  return "";
}

/* ==================================================
 * Find key pages to crawl
 * ================================================== */
function findKeyPages(
  baseUrl: string,
  html: string,
  maxDepth: number = 0
): string[] {
  const pages: Set<string> = new Set();
  
  // Add base URL
  pages.add(baseUrl);
  
  if (maxDepth === 0) return Array.from(pages);
  
  // Extract domain
  const domain = new URL(baseUrl).origin;
  
  // Find links that might contain contact or about info
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  const matches = html.matchAll(linkRegex);
  
  const keywords = [
    "contact", "about", "company", "impressum", "imprint",
    "about-us", "aboutus", "kontakt", "uber-uns", "ueber-uns",
    "team", "who-we-are", "our-company", "our-team",
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
  
  return Array.from(pages).slice(0, maxDepth === 1 ? 5 : 10);
}

/* ==================================================
 * Detect company type from text content
 * ================================================== */
function detectCompanyType(textContent: string): string {
  const lower = textContent.toLowerCase();
  
  // Check for manufacturer indicators
  const manufacturerKeywords = [
    "manufacturer", "manufacturing", "factory", "production facility",
    "we manufacture", "we produce", "production plant", "fabrication",
  ];
  if (manufacturerKeywords.some(kw => lower.includes(kw))) {
    return "manufacturer";
  }
  
  // Check for distributor indicators
  const distributorKeywords = [
    "distributor", "distribution", "wholesale", "wholesaler",
    "authorized distributor", "official distributor",
  ];
  if (distributorKeywords.some(kw => lower.includes(kw))) {
    return "distributor";
  }
  
  // Check for dealer indicators
  const dealerKeywords = [
    "dealer", "retailer", "retail", "reseller", "authorized dealer",
  ];
  if (dealerKeywords.some(kw => lower.includes(kw))) {
    return "dealer";
  }
  
  return "other";
}

/* ==================================================
 * Main crawl logic
 * ================================================== */
async function crawlDomain(
  url: string,
  domain: string,
  brandDict: string[],
  maxPages: number = 3,
  profile: "quick" | "deep" = "quick"
): Promise<CrawlResult> {
  const config = CRAWL_PROFILES[profile];
  const pagesToCrawl: string[] = [url];
  const crawledPages: PageData[] = [];
  const allEmails = new Set<string>();
  const allPhones = new Set<string>();
  const allBrands = new Set<string>();
  const countryDetections: CountryDetection[] = [];
  const textForCompanyType: string[] = [];
  
  // Fetch homepage first
  let html = await fetchPage(
    url,
    config.pageTimeoutMs,
    config.retries || 0
  );
  
  if (html) {
    crawledPages.push({ url, html });
    
    // Find additional pages to crawl
    if (config.maxDepth > 0) {
      const keyPages = findKeyPages(url, html, config.maxDepth);
      for (const page of keyPages) {
        if (!pagesToCrawl.includes(page)) {
          pagesToCrawl.push(page);
        }
      }
    }
  }
  
  // Crawl additional pages (up to maxPages total)
  const effectiveMaxPages = Math.min(maxPages, config.maxPages);
  for (let i = 1; i < pagesToCrawl.length && i < effectiveMaxPages; i++) {
    const pageUrl = pagesToCrawl[i];
    const pageHtml = await fetchPage(
      pageUrl,
      config.pageTimeoutMs,
      config.retries || 0
    );
    if (pageHtml) {
      crawledPages.push({ url: pageUrl, html: pageHtml });
    }
  }
  
  // Parse all crawled pages
  for (const page of crawledPages) {
    const parsed = parsePage(page);
    
    // Collect contacts
    parsed.contacts.emails.forEach(e => allEmails.add(e));
    parsed.contacts.phones.forEach(p => allPhones.add(p));
    
    // Detect country
    if (parsed.country) {
      countryDetections.push(parsed.country);
    }
    
    // Match brands - use full dictionary without early return
    const brands = matchBrands(parsed.textContent, brandDict);
    brands.forEach(b => allBrands.add(b));
    
    // Collect text for company type detection
    textForCompanyType.push(parsed.textContent);
  }
  
  // Combine country detections (highest confidence wins)
  const bestCountry = countryDetections.length > 0
    ? countryDetections.reduce((best, curr) =>
        curr.confidenceScore > best.confidenceScore ? curr : best
      )
    : null;
  
  // Detect company type from all text
  const companyType = profile === "deep" 
    ? detectCompanyType(textForCompanyType.join(" "))
    : undefined;
  
  const result: CrawlResult = {
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
  
  if (companyType) {
    result.companyType = companyType;
  }
  
  return result;
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
    const { url, domain, maxPages, profile = "quick" } = body;
    
    if (!url || !domain) {
      return NextResponse.json(
        { error: "Missing url or domain" },
        { status: 400 }
      );
    }
    
    // Validate profile
    if (profile !== "quick" && profile !== "deep") {
      return NextResponse.json(
        { error: "Invalid profile. Must be 'quick' or 'deep'" },
        { status: 400 }
      );
    }
    
    // Create requestId for idempotency
    const requestId = `${tenantId}:${domain}:${profile}`;
    const now = Date.now();
    
    // Clean old cache entries
    for (const [key, timestamp] of requestCache.entries()) {
      if (now - timestamp > CACHE_TTL_MS) {
        requestCache.delete(key);
      }
    }
    
    // Check for duplicate request
    const cachedTime = requestCache.get(requestId);
    if (cachedTime && now - cachedTime < CACHE_TTL_MS) {
      return NextResponse.json(
        { error: "Duplicate request. Please wait before retrying." },
        { status: 429 }
      );
    }
    
    // Store request in cache
    requestCache.set(requestId, now);
    
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
    
    // Get profile config
    const config = CRAWL_PROFILES[profile];
    const effectiveMaxPages = maxPages 
      ? Math.min(maxPages, config.maxPages)
      : config.maxPages;
    
    // Perform crawl
    const result = await crawlDomain(
      url,
      domain,
      brandDict,
      effectiveMaxPages,
      profile
    );
    
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("/api/crawl error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Crawl failed" },
      { status: 500 }
    );
  }
}
