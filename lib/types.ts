// lib/types.ts
// Core types for shallow crawl and scoring

export type PageType = "CONTACT" | "ABOUT" | "PRODUCTS" | "OTHER";

export interface PageDescriptor {
  url: string;
  title: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  firstParagraph: string | null;
  emails: string[];
  phones: string[];
  addresses: string[];
  brandHits: string[];
  rawHash: string; // hash of raw content for dedup
}

export interface PageTypeResult {
  pageType: PageType;
  confidence: number;
  evidence: string[];
}

export interface FactPool {
  coverage: {
    hasContact: boolean;
    hasAbout: boolean;
    hasProducts: boolean;
    totalPages: number;
  };
  brandsVerified: string[];
  brandsUnverified: string[];
  countryIndicators: string[];
  lowInfo: boolean;
  evidenceScore: number;
}

export interface AnalyzeResult {
  factPool: FactPool;
  pages: (PageDescriptor & PageTypeResult)[];
  companyType?: "manufacturer" | "distributor" | "dealer" | "other";
  countryISO2?: string | null;
  detectedBrands?: string[];
  score?: "GOOD" | "MAYBE" | "BAD";
  summary?: string;
  evidence?: string[];
}
