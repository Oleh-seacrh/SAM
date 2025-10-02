// lib/llm-presets.ts
// LLM presets for page type classification and scoring

export function pageTypePreset(pageContent: string): string {
  return `Classify this web page into one of these types: CONTACT, ABOUT, PRODUCTS, OTHER.

CONTACT: Contains contact information, contact forms, addresses, phones, emails, "Contact Us", "Get in Touch"
ABOUT: Company information, "About Us", company history, team, mission, vision
PRODUCTS: Product listings, services, catalog, "Our Products", "What We Offer"
OTHER: Home page, news, blog, generic content that doesn't fit above

Analyze the following page content and return your classification.

Page content:
${pageContent.slice(0, 3000)}

Return ONLY a JSON object with this EXACT structure (no markdown, no backticks):
{
  "pageType": "CONTACT" | "ABOUT" | "PRODUCTS" | "OTHER",
  "confidence": 0.0-1.0,
  "evidence": ["reason 1", "reason 2", "reason 3"]
}

Provide 2-3 specific pieces of evidence from the content.`;
}

export function scorePreset(factPool: any, userPrompt?: string): string {
  const brandsText = factPool.brandsVerified?.length 
    ? `Verified brands: ${factPool.brandsVerified.join(", ")}` 
    : "No brands verified";
  
  const coverageText = `Coverage: ${factPool.coverage.totalPages} pages analyzed. Has Contact: ${factPool.coverage.hasContact}, Has About: ${factPool.coverage.hasAbout}, Has Products: ${factPool.coverage.hasProducts}`;
  
  const countriesText = factPool.countryIndicators?.length
    ? `Country indicators: ${factPool.countryIndicators.join(", ")}`
    : "No country indicators found";

  const basePrompt = `You are an expert B2B prospecting assistant for medical imaging consumables (X-ray film, plates, chemistry, cassettes, viewers).

Analyze the following aggregated facts from website crawl and score this company.

${coverageText}
${brandsText}
${countriesText}
Evidence score: ${factPool.evidenceScore || 0}
Low info flag: ${factPool.lowInfo || false}

${userPrompt ? `User focus: ${userPrompt}\n` : ""}

Score the company as:
- GOOD: Clear relevant supplier (manufacturer/distributor/dealer) of imaging consumables
- MAYBE: Partially relevant or uncertain
- BAD: Blogs, news, generic directories/marketplaces, unrelated

Return ONLY a JSON object with this EXACT structure (no markdown, no backticks):
{
  "score": "GOOD" | "MAYBE" | "BAD",
  "companyType": "manufacturer" | "distributor" | "dealer" | "other",
  "countryISO2": "XX" | null,
  "detectedBrands": ["Brand1", "Brand2"],
  "summary": "Brief explanation of the score",
  "evidence": ["specific evidence 1", "specific evidence 2", "specific evidence 3"]
}

Rules:
- Country: Only if explicitly present (ISO-2 code)
- Company type: Choose most appropriate or "other" if unclear
- Brands: Only explicitly mentioned brands, deduplicate
- Evidence: 3-5 specific facts that support the score`;

  return basePrompt;
}
