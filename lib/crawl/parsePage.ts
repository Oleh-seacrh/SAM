// lib/crawl/parsePage.ts
// Parse page content to extract contacts, brands, and country

import { detectCountry, CountryDetection } from "../country";

export interface PageData {
  url: string;
  html: string;
}

export interface ParsedPage {
  url: string;
  contacts: {
    emails: string[];
    phones: string[];
  };
  country: CountryDetection | null;
  textContent: string; // For brand matching
}

/**
 * Extract email addresses from HTML
 */
function extractEmails(html: string): string[] {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = html.match(emailRegex) || [];
  return Array.from(new Set(matches.map(e => e.toLowerCase())));
}

/**
 * Extract phone numbers from HTML
 * Looks for patterns like +XX, 00XX, or phone: labels
 */
function extractPhones(html: string): string[] {
  const phones: Set<string> = new Set();
  
  // Pattern 1: +XX XXX XXX XXXX or +XX-XXX-XXX-XXXX
  const plusPattern = /\+\d{1,3}[\s\-.]?\d{1,4}[\s\-.]?\d{1,4}[\s\-.]?\d{1,9}/g;
  const plusMatches = html.match(plusPattern) || [];
  plusMatches.forEach(p => phones.add(p));
  
  // Pattern 2: 00XX XXX XXX XXXX (international prefix)
  const zeroPattern = /00\d{1,3}[\s\-.]?\d{1,4}[\s\-.]?\d{1,4}[\s\-.]?\d{1,9}/g;
  const zeroMatches = html.match(zeroPattern) || [];
  zeroMatches.forEach(p => phones.add(p));
  
  // Pattern 3: Phone: label followed by number
  const labelPattern = /(?:phone|tel|telephone|mobile|fax)[\s:]+(\+?\d[\d\s\-().]{7,20}\d)/gi;
  const labelMatches = html.matchAll(labelPattern);
  for (const match of labelMatches) {
    if (match[1]) phones.add(match[1]);
  }
  
  return Array.from(phones);
}

/**
 * Extract text content from HTML (remove tags)
 */
function extractTextContent(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a page to extract contacts, country, and text
 */
export function parsePage(page: PageData): ParsedPage {
  const { url, html } = page;
  
  // Extract contacts
  const emails = extractEmails(html);
  const phones = extractPhones(html);
  
  // Extract text for country and brand detection
  const textContent = extractTextContent(html);
  
  // Detect country from all available signals
  const domain = new URL(url).hostname;
  const country = detectCountry({
    text: textContent,
    phones,
    domain,
  });
  
  return {
    url,
    contacts: {
      emails,
      phones,
    },
    country,
    textContent,
  };
}
