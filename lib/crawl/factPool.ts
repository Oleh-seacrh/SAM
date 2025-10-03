// lib/crawl/factPool.ts
// Brand matching from tenant brands

/**
 * Match brands in text using case-insensitive word boundaries
 * Returns deduplicated set of matched brands
 */
export function matchBrands(text: string, brandDict: string[]): string[] {
  if (!text || brandDict.length === 0) return [];
  
  const lowerText = text.toLowerCase();
  const matchedBrands = new Set<string>();
  
  for (const brand of brandDict) {
    if (!brand || brand.trim().length === 0) continue;
    
    const brandLower = brand.toLowerCase();
    
    // Use word boundary for matching
    // \b doesn't work well with all characters, so we use a more flexible approach
    const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9])${escapeRegex(brandLower)}(?:$|\\s|[^a-zA-Z0-9])`, "i");
    
    if (regex.test(lowerText)) {
      matchedBrands.add(brand); // Keep original casing from brandDict
    }
  }
  
  return Array.from(matchedBrands);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
