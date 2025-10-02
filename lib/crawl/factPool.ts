// lib/crawl/factPool.ts
// Aggregate multiple page descriptors into a FactPool

import type { PageDescriptor, PageTypeResult, FactPool } from "../types";

export function buildFactPool(
  pages: (PageDescriptor & PageTypeResult)[],
  brandDict: string[]
): FactPool {
  const totalPages = pages.length;
  
  // Check coverage
  const hasContact = pages.some(p => p.pageType === "CONTACT");
  const hasAbout = pages.some(p => p.pageType === "ABOUT");
  const hasProducts = pages.some(p => p.pageType === "PRODUCTS");

  // Aggregate brands
  const allBrandHits = new Set<string>();
  for (const page of pages) {
    for (const brand of page.brandHits) {
      allBrandHits.add(brand);
    }
  }

  // Separate verified (in dict) vs unverified
  const brandsVerified = Array.from(allBrandHits).filter(b => 
    brandDict.some(db => db.toLowerCase() === b.toLowerCase())
  );
  const brandsUnverified = Array.from(allBrandHits).filter(b =>
    !brandDict.some(db => db.toLowerCase() === b.toLowerCase())
  );

  // Country indicators (simple heuristic from addresses)
  const countryIndicators: Set<string> = new Set();
  for (const page of pages) {
    for (const address of page.addresses) {
      // Look for country names or codes (very basic)
      const countries = extractCountryIndicators(address);
      countries.forEach(c => countryIndicators.add(c));
    }
  }

  // Evidence score: sum of confidence * type weight
  let evidenceScore = 0;
  for (const page of pages) {
    const weight = getPageTypeWeight(page.pageType);
    evidenceScore += page.confidence * weight;
  }
  evidenceScore = Math.round(evidenceScore * 100) / 100;

  // Low info flag: if we have very little data
  const lowInfo = 
    totalPages < 2 ||
    (!hasContact && !hasAbout && !hasProducts) ||
    (pages.every(p => !p.title && p.h1.length === 0));

  return {
    coverage: {
      hasContact,
      hasAbout,
      hasProducts,
      totalPages,
    },
    brandsVerified,
    brandsUnverified,
    countryIndicators: Array.from(countryIndicators),
    lowInfo,
    evidenceScore,
  };
}

function getPageTypeWeight(pageType: string): number {
  switch (pageType) {
    case "CONTACT": return 1.5;
    case "ABOUT": return 1.2;
    case "PRODUCTS": return 1.3;
    case "OTHER": return 0.5;
    default: return 1.0;
  }
}

function extractCountryIndicators(text: string): string[] {
  const indicators: string[] = [];
  const lower = text.toLowerCase();

  // Very basic country detection
  const countries = [
    "usa", "canada", "mexico", "germany", "france", "italy", "spain",
    "uk", "china", "japan", "india", "australia", "brazil", "russia",
  ];

  for (const country of countries) {
    if (lower.includes(country)) {
      indicators.push(country);
    }
  }

  return indicators;
}
