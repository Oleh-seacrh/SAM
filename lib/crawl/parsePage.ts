/**
 * Parse a web page to extract useful information
 */

export type ParsedPage = {
  url: string;
  title: string;
  text: string;
  emails: string[];
  phones: string[];
  links: string[];
  isContactPage: boolean;
  isAboutPage: boolean;
};

/**
 * Extract emails from text
 */
export function extractEmails(text: string): string[] {
  if (!text) return [];
  
  // Comprehensive email regex
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  
  // Deduplicate and normalize
  const unique = Array.from(new Set(matches.map(e => e.toLowerCase())));
  
  // Filter out common false positives
  return unique.filter(e => {
    // Exclude image file extensions
    if (e.match(/\.(jpg|jpeg|png|gif|svg|webp)@/i)) return false;
    // Exclude example domains
    if (e.match(/@(example\.com|test\.com|localhost)/i)) return false;
    return true;
  });
}

/**
 * Extract phone numbers from text
 */
export function extractPhones(text: string): string[] {
  if (!text) return [];
  
  const phones = new Set<string>();
  
  // International format: +XX XXX XXX XXXX
  const intlRegex = /\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}/g;
  const intlMatches = text.match(intlRegex) || [];
  intlMatches.forEach(p => phones.add(p.trim()));
  
  // US/Canada format: (XXX) XXX-XXXX or XXX-XXX-XXXX
  const usRegex = /(\(\d{3}\)\s?|\d{3}[-.\s]?)\d{3}[-.\s]?\d{4}/g;
  const usMatches = text.match(usRegex) || [];
  usMatches.forEach(p => phones.add(p.trim()));
  
  // Generic: sequences of 7+ digits with separators
  const genericRegex = /\b\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{2,4}[\s.-]?\d{2,4}\b/g;
  const genericMatches = text.match(genericRegex) || [];
  genericMatches
    .filter(p => p.replace(/\D/g, "").length >= 7) // At least 7 digits
    .forEach(p => phones.add(p.trim()));
  
  return Array.from(phones).slice(0, 10); // Limit to 10 phone numbers
}

/**
 * Extract links from HTML
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  if (!html) return [];
  
  try {
    const base = new URL(baseUrl);
    const links = new Set<string>();
    
    // Simple regex to extract href attributes
    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const href = match[1];
        // Skip anchors, javascript, mailto, tel, etc.
        if (href.startsWith('#') || href.startsWith('javascript:') || 
            href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }
        
        // Resolve relative URLs
        const absoluteUrl = new URL(href, base).href;
        
        // Only keep links from the same domain
        const linkUrl = new URL(absoluteUrl);
        if (linkUrl.hostname === base.hostname) {
          links.add(absoluteUrl);
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
    
    return Array.from(links).slice(0, 50); // Limit to 50 links
  } catch (e) {
    return [];
  }
}

/**
 * Check if a URL/text suggests a contact page
 */
export function isContactPage(url: string, text: string): boolean {
  const lower = url.toLowerCase();
  const textLower = text.toLowerCase().slice(0, 1000); // Check first 1000 chars
  
  // Check URL patterns
  if (lower.match(/\/(contact|kontakt|contacto|contato|連絡|联系|contactez)/i)) {
    return true;
  }
  
  // Check text patterns
  if (textLower.match(/\b(contact us|get in touch|reach us|email us|call us)\b/i)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a URL/text suggests an about page
 */
export function isAboutPage(url: string, text: string): boolean {
  const lower = url.toLowerCase();
  const textLower = text.toLowerCase().slice(0, 1000);
  
  // Check URL patterns
  if (lower.match(/\/(about|uber|sobre|a-propos|chi-siamo|关于|について)/i)) {
    return true;
  }
  
  // Check text patterns
  if (textLower.match(/\b(about us|who we are|our company|our story|our mission)\b/i)) {
    return true;
  }
  
  return false;
}

/**
 * Clean and extract text from HTML
 */
export function extractText(html: string): string {
  if (!html) return "";
  
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--.*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a web page
 */
export async function parsePage(url: string, timeoutMs = 8000): Promise<ParsedPage | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const text = extractText(html);
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    return {
      url,
      title,
      text: text.slice(0, 10000), // Limit text length
      emails: extractEmails(text),
      phones: extractPhones(text),
      links: extractLinks(html, url),
      isContactPage: isContactPage(url, text),
      isAboutPage: isAboutPage(url, text),
    };
  } catch (e: any) {
    console.warn(`Failed to parse ${url}:`, e?.message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Find contact/about pages from a list of links
 */
export function findContactPages(links: string[]): string[] {
  const contact: string[] = [];
  const about: string[] = [];
  
  for (const link of links) {
    const lower = link.toLowerCase();
    if (lower.match(/\/(contact|kontakt)/i)) {
      contact.push(link);
    } else if (lower.match(/\/(about|uber)/i)) {
      about.push(link);
    }
  }
  
  // Prioritize contact pages, then about pages
  return [...contact, ...about].slice(0, 5);
}
