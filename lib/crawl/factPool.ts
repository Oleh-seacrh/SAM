/**
 * Fact pool - aggregates information from multiple pages
 */

import { ParsedPage } from "./parsePage";

export type FactPool = {
  domain: string;
  emails: string[];
  phones: string[];
  text: string; // Combined text from all pages
  pagesAnalyzed: number;
  contactPageFound: boolean;
  aboutPageFound: boolean;
};

/**
 * Create an empty fact pool
 */
export function createFactPool(domain: string): FactPool {
  return {
    domain,
    emails: [],
    phones: [],
    text: "",
    pagesAnalyzed: 0,
    contactPageFound: false,
    aboutPageFound: false,
  };
}

/**
 * Add a parsed page to the fact pool
 */
export function addPageToPool(pool: FactPool, page: ParsedPage): FactPool {
  // Deduplicate emails
  const emailSet = new Set([...pool.emails, ...page.emails]);
  
  // Deduplicate phones
  const phoneSet = new Set([...pool.phones, ...page.phones]);
  
  // Combine text (limit total length)
  const combinedText = pool.text + "\n" + page.text;
  const truncatedText = combinedText.slice(0, 20000);
  
  return {
    ...pool,
    emails: Array.from(emailSet).slice(0, 10),
    phones: Array.from(phoneSet).slice(0, 10),
    text: truncatedText,
    pagesAnalyzed: pool.pagesAnalyzed + 1,
    contactPageFound: pool.contactPageFound || page.isContactPage,
    aboutPageFound: pool.aboutPageFound || page.isAboutPage,
  };
}

/**
 * Check if the pool has sufficient information
 */
export function hasEnoughInfo(pool: FactPool): boolean {
  // Consider sufficient if we have at least one email or phone
  // AND we've checked contact/about pages
  return (
    (pool.emails.length > 0 || pool.phones.length > 0) &&
    (pool.contactPageFound || pool.aboutPageFound || pool.pagesAnalyzed >= 3)
  );
}
