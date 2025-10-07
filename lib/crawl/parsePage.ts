// lib/crawl/parsePage.ts
// Parse page content to extract contacts, brands, and country

import { detectCountry, CountryDetection } from "../country";
import { detectCountryLLM } from "../llmCountry";

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
 * Validate and normalize a phone number candidate
 */
function validatePhone(raw: string): string | null {
  // Extract only digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\+/g, "");
  
  // Must have 7-15 digits (international standard)
  if (digits.length < 7 || digits.length > 15) return null;
  
  // Reject if all digits are the same (e.g., 111111111)
  if (/^(\d)\1+$/.test(digits)) return null;
  
  // Reject common false positives (dates, years, IDs)
  if (digits.length === 8 && /^20\d{6}$/.test(digits)) return null; // Dates like 20231215
  if (digits.length === 4 && /^(19|20)\d{2}$/.test(digits)) return null; // Years
  
  // Normalize: keep + if present, otherwise just digits
  const hasPlus = raw.startsWith("+");
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Extract phone numbers from HTML with improved accuracy
 * Prioritizes tel: links and context-aware patterns
 */
function extractPhones(html: string): string[] {
  const phones: Map<string, number> = new Map(); // phone -> priority score
  
  // Priority 1: tel: links (highest confidence)
  const telLinkPattern = /href=["']tel:([^"']+)["']/gi;
  for (const match of html.matchAll(telLinkPattern)) {
    const normalized = validatePhone(match[1]);
    if (normalized) {
      phones.set(normalized, (phones.get(normalized) || 0) + 10);
    }
  }
  
  // Priority 2: Phone/contact labels with nearby numbers
  const labelPattern = /(?:phone|tel|telephone|mobile|fax|contact|тел|телефон|моб)[\s:]{0,5}(\+?\d[\d\s\-().]{7,20}\d)/gi;
  for (const match of html.matchAll(labelPattern)) {
    const normalized = validatePhone(match[1]);
    if (normalized) {
      phones.set(normalized, (phones.get(normalized) || 0) + 8);
    }
  }
  
  // Priority 3: International format (+XX or 00XX)
  const intlPattern = /(?:\+|00)\d{1,3}[\s\-.]?\d{1,4}[\s\-.]?\d{1,4}[\s\-.]?\d{1,9}/g;
  for (const match of html.matchAll(intlPattern)) {
    const normalized = validatePhone(match[0]);
    if (normalized) {
      phones.set(normalized, (phones.get(normalized) || 0) + 5);
    }
  }
  
  // Priority 4: Parentheses format (e.g., (044) 123-4567)
  const parenPattern = /\(?\d{2,4}\)?[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}[\s\-.]?\d{2,4}/g;
  for (const match of html.matchAll(parenPattern)) {
    const normalized = validatePhone(match[0]);
    if (normalized) {
      // Only add if not already found with higher priority
      if (!phones.has(normalized)) {
        phones.set(normalized, 2);
      }
    }
  }
  
  // Sort by priority (highest first) and return unique phones
  return Array.from(phones.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([phone]) => phone)
    .slice(0, 10); // Limit to top 10 to avoid spam
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
export async function parsePage(page: PageData): Promise<ParsedPage> {
  const { url, html } = page;
  
  // Extract contacts
  const emails = extractEmails(html);
  const phones = extractPhones(html);
  
  // Extract text for country and brand detection
  const textContent = extractTextContent(html);
  
  // Detect country from all available signals
  const domain = new URL(url).hostname;

  // Try LLM first (most accurate, context-aware)
  let country: CountryDetection | null = null;
  try {
    const llmResult = await detectCountryLLM({
      text: textContent,
      phones,
      domain,
    });
    if (llmResult) {
      country = {
        iso2: llmResult.iso2!,
        confidence: llmResult.confidence,
        confidenceScore: llmResult.confidenceScore,
        source: "WORD", // LLM is conceptually "WORD" (text-based inference)
      };
    }
  } catch (e) {
    console.warn("LLM country detection failed, falling back to heuristic:", e);
  }

  // Fallback to heuristic if LLM fails or returns null
  if (!country) {
    country = detectCountry({
      text: textContent,
      phones,
      domain,
    });
  }
  
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
