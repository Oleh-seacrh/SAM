// lib/llmCountry.ts
// LLM-based country detection (context-aware, no hardcoded dictionaries)

import { jsonExtract } from "./llm";

export interface LLMCountryDetection {
  iso2: string | null; // ISO 3166-1 alpha-2 code (e.g., "UA", "DE", "PL")
  confidence: "HIGH" | "WEAK";
  confidenceScore: number; // 0.0 - 1.0
}

/**
 * LLM-based country detection from text, contacts, domain
 * Uses GPT-4o-mini to infer country from context
 */
export async function detectCountryLLM(params: {
  text: string; // Cleaned text from page (contact/about)
  phones?: string[];
  domain?: string;
}): Promise<LLMCountryDetection | null> {
  const { text, phones = [], domain } = params;

  // Limit text to ~4k chars to save tokens
  const snippet = text.slice(0, 4000);

  const schema = {
    type: "object",
    properties: {
      iso2: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
      confidence: { type: "string", enum: ["HIGH", "WEAK"] },
      confidenceScore: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["iso2", "confidence", "confidenceScore"],
  };

  const system = [
    "You are a country detection expert.",
    "Return STRICT JSON with { iso2, confidence, confidenceScore }.",
    "iso2: ISO 3166-1 alpha-2 code (e.g., 'UA', 'DE', 'PL', 'US', 'CN') or null if unknown.",
    "confidence: 'HIGH' if explicit mention (address, city, country name, phone prefix), 'WEAK' if only domain TLD hint.",
    "confidenceScore: 0.0 to 1.0 (1.0 = certain, 0.6 = weak TLD hint).",
    "Analyze context carefully: distinguish 'Georgia (country)' from 'Georgia, USA'.",
  ].join("\n");

  const user = [
    "Determine the country where this company is located based on:",
    domain ? `Domain: ${domain}` : "",
    phones.length ? `Phones: ${phones.slice(0, 3).join(", ")}` : "",
    "Text snippet (contact/about page):",
    snippet,
    "",
    "Return JSON { iso2, confidence, confidenceScore }.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await jsonExtract<{
      iso2: string | null;
      confidence: "HIGH" | "WEAK";
      confidenceScore: number;
    }>({ system, user, schema, temperature: 0 });

    if (!result || !result.iso2 || !/^[A-Z]{2}$/.test(result.iso2)) {
      return null;
    }

    return {
      iso2: result.iso2,
      confidence: result.confidence || "WEAK",
      confidenceScore:
        typeof result.confidenceScore === "number" && result.confidenceScore >= 0 && result.confidenceScore <= 1
          ? result.confidenceScore
          : 0.5,
    };
  } catch (e) {
    console.warn("detectCountryLLM failed:", e);
    return null;
  }
}
