// lib/crawl/parsePage.ts
// Clean HTML and extract PageDescriptor

import crypto from "crypto";
import type { PageDescriptor } from "../types";

export function parsePage(url: string, html: string, brandDict: string[]): PageDescriptor {
  // Remove scripts, styles, comments
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Extract title
  const titleMatch = cleaned.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Extract headings
  const h1 = extractHeadings(cleaned, "h1");
  const h2 = extractHeadings(cleaned, "h2");
  const h3 = extractHeadings(cleaned, "h3");

  // Extract first paragraph
  const firstParagraph = extractFirstParagraph(cleaned);

  // Strip all remaining HTML tags
  const text = cleaned.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Extract contact info
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const addresses = extractAddresses(text);

  // Brand hits
  const brandHits = findBrandHits(text, brandDict);

  // Raw hash for dedup
  const rawHash = crypto.createHash("md5").update(text.slice(0, 5000)).digest("hex");

  return {
    url,
    title,
    h1,
    h2,
    h3,
    firstParagraph,
    emails,
    phones,
    addresses,
    brandHits,
    rawHash,
  };
}

function extractHeadings(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, "gi");
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text) matches.push(text);
  }
  return matches.slice(0, 10); // limit
}

function extractFirstParagraph(html: string): string | null {
  const regex = /<p[^>]*>(.*?)<\/p>/i;
  const match = regex.exec(html);
  if (match) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    return text.slice(0, 500) || null;
  }
  return null;
}

function extractEmails(text: string): string[] {
  const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matches = text.match(regex) || [];
  const unique = Array.from(new Set(matches.map(e => e.toLowerCase())));
  return unique.slice(0, 10);
}

function extractPhones(text: string): string[] {
  // Simple phone pattern: +1234567890, (123) 456-7890, etc.
  const regex = /(\+?\d{1,4}[\s.-]?)?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g;
  const matches = text.match(regex) || [];
  // Filter likely phones (at least 7 digits)
  const phones = matches.filter(m => (m.match(/\d/g) || []).length >= 7);
  const unique = Array.from(new Set(phones));
  return unique.slice(0, 10);
}

function extractAddresses(text: string): string[] {
  // Very basic: look for common address keywords
  // This is a simplified heuristic
  const addressKeywords = ["street", "avenue", "road", "blvd", "suite", "floor", "building"];
  const lines = text.split(/[.;]/);
  const addresses: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (addressKeywords.some(kw => lower.includes(kw))) {
      addresses.push(line.trim().slice(0, 200));
      if (addresses.length >= 5) break;
    }
  }

  return addresses;
}

function findBrandHits(text: string, brandDict: string[]): string[] {
  const lowerText = text.toLowerCase();
  const hits: Set<string> = new Set();

  for (const brand of brandDict) {
    const lowerBrand = brand.toLowerCase();
    if (lowerText.includes(lowerBrand)) {
      hits.add(brand);
    }
  }

  return Array.from(hits);
}
