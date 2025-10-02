// lib/crawl/extractLinks.ts
// Extract all <a> links from HTML and optionally sitemap

export interface ExtractedLinks {
  links: string[];
  hasSitemap: boolean;
  sitemapUrl?: string;
}

export function extractLinks(html: string, baseUrl: string): ExtractedLinks {
  const links: Set<string> = new Set();
  let hasSitemap = false;
  let sitemapUrl: string | undefined;

  try {
    const base = new URL(baseUrl);
    const baseDomain = base.hostname.toLowerCase();

    // Extract all <a href="...">
    const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }

      try {
        const absoluteUrl = new URL(href, baseUrl);
        
        // Only same domain
        if (absoluteUrl.hostname.toLowerCase() !== baseDomain) {
          continue;
        }

        // Skip common non-content paths
        const path = absoluteUrl.pathname.toLowerCase();
        if (
          path.endsWith(".pdf") ||
          path.endsWith(".jpg") ||
          path.endsWith(".jpeg") ||
          path.endsWith(".png") ||
          path.endsWith(".gif") ||
          path.endsWith(".svg") ||
          path.endsWith(".zip") ||
          path.endsWith(".mp4") ||
          path.includes("/cdn-cgi/") ||
          path.includes("/wp-content/uploads/") ||
          path.includes("/assets/")
        ) {
          continue;
        }

        links.add(absoluteUrl.href);
      } catch {
        // Invalid URL, skip
      }
    }

    // Check for sitemap reference in HTML
    const sitemapRegex = /<link[^>]+rel=["']?sitemap["']?[^>]+href=["']([^"']+)["']/gi;
    const sitemapMatch = sitemapRegex.exec(html);
    if (sitemapMatch) {
      try {
        const sitemapAbsolute = new URL(sitemapMatch[1], baseUrl);
        if (sitemapAbsolute.hostname.toLowerCase() === baseDomain) {
          hasSitemap = true;
          sitemapUrl = sitemapAbsolute.href;
        }
      } catch {
        // Invalid sitemap URL
      }
    }

    // Also check common sitemap locations
    if (!hasSitemap) {
      const commonSitemaps = [
        `${base.protocol}//${base.hostname}/sitemap.xml`,
        `${base.protocol}//${base.hostname}/sitemap_index.xml`,
      ];
      // We'll just note them but won't fetch in this function
      // The caller can decide to fetch if needed
    }

    return {
      links: Array.from(links),
      hasSitemap,
      sitemapUrl,
    };
  } catch (error) {
    console.error("extractLinks error:", error);
    return { links: [], hasSitemap: false };
  }
}

export async function extractLinksFromSitemap(sitemapUrl: string, baseUrl: string): Promise<string[]> {
  try {
    const base = new URL(baseUrl);
    const baseDomain = base.hostname.toLowerCase();

    const response = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const urlRegex = /<loc>([^<]+)<\/loc>/gi;
    const urls: Set<string> = new Set();
    let match;

    while ((match = urlRegex.exec(xml)) !== null) {
      const url = match[1].trim();
      try {
        const parsed = new URL(url);
        if (parsed.hostname.toLowerCase() === baseDomain) {
          urls.add(url);
        }
      } catch {
        // Invalid URL
      }
    }

    return Array.from(urls);
  } catch (error) {
    console.error("extractLinksFromSitemap error:", error);
    return [];
  }
}
