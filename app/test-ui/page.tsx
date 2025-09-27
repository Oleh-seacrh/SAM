"use client";

import { Badge } from "@/components/ui/Badge";
import { BrandBadge } from "@/components/search/BrandBadge";
import { CountryPill } from "@/components/search/CountryPill";
import { TypePill } from "@/components/search/TypePill";

// Mock data for demonstration
const mockScores = {
  "medem.de": {
    label: "good" as const,
    confidence: 0.85,
    reasons: ["German medical distributor", "X-ray film products", "B2B focus"],
    tags: ["distributor", "medical", "xray-film", "germany", "b2b"],
    companyType: "distributor" as const,
    countryISO2: "DE",
    countryName: "Germany", 
    detectedBrands: ["Kodak", "Fuji", "Agfa"]
  },
  "fujifilm-healthcare.com": {
    label: "good" as const, 
    confidence: 0.95,
    reasons: ["Major manufacturer", "Healthcare division", "Direct supplier"],
    tags: ["manufacturer", "healthcare", "imaging", "medical", "b2b"],
    companyType: "manufacturer" as const,
    countryISO2: "JP",
    countryName: "Japan",
    detectedBrands: ["Fujifilm", "FujiFilm Medical Systems"]
  },
  "medical-blog-news.com": {
    label: "bad" as const,
    confidence: 0.9,
    reasons: ["News blog", "Not a supplier", "Editorial content"],
    tags: ["blog", "news", "editorial", "information"],
    companyType: "other" as const,
    countryISO2: null,
    countryName: null,
    detectedBrands: []
  },
  "india-xray-supplies.co.in": {
    label: "maybe" as const,
    confidence: 0.65,
    reasons: ["Local distributor", "Smaller market", "Limited information"],
    tags: ["distributor", "local", "xray", "supplies"],
    companyType: "dealer" as const,
    countryISO2: "IN", 
    countryName: "India",
    detectedBrands: ["Carestream", "Konica"]
  }
};

const mockItems = [
  {
    title: "Medem Medical - X-Ray Film Distributor Germany",
    link: "https://medem.de/products",
    displayLink: "medem.de",
    snippet: "Leading distributor of medical X-ray films and imaging supplies across Germany and Europe.",
    homepage: "https://medem.de"
  },
  {
    title: "Fujifilm Healthcare Europe - Medical Imaging Solutions",
    link: "https://fujifilm-healthcare.com/eu/",
    displayLink: "fujifilm-healthcare.com",
    snippet: "Advanced medical imaging technology and X-ray film manufacturing by Fujifilm.",
    homepage: "https://fujifilm-healthcare.com"
  },
  {
    title: "Medical Blog News - Latest in Radiology",
    link: "https://medical-blog-news.com/radiology",
    displayLink: "medical-blog-news.com", 
    snippet: "Weekly updates and news from the medical imaging and radiology industry.",
    homepage: "https://medical-blog-news.com"
  },
  {
    title: "India X-Ray Supplies - Medical Equipment Dealer",
    link: "https://india-xray-supplies.co.in/catalog",
    displayLink: "india-xray-supplies.co.in",
    snippet: "Medical imaging supplies and X-ray equipment dealer serving hospitals in India.",
    homepage: "https://india-xray-supplies.co.in"
  }
];

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function TestUIPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">LLM Analysis Demo</h1>
        <div className="text-sm text-gray-500">Enhanced scoring with country, company type, and brand detection</div>
      </div>

      <div className="space-y-3">
        <div className="text-sm text-gray-400">
          Query: <b>x-ray film distributor germany</b> • Demo Results
        </div>

        <ul className="space-y-3">
          {mockItems.map((it) => {
            const domain = getDomain(it.homepage);
            const score = mockScores[domain as keyof typeof mockScores];

            return (
              <li key={it.link} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <a href={it.link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                      {it.title}
                    </a>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      {it.displayLink} •{" "}
                      <a href={it.homepage} target="_blank" rel="noreferrer" className="hover:underline">
                        {domain}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Score badges */}
                    {score && (
                      <div className="flex gap-2">
                        <Badge tone={score.label}>{score.label.toUpperCase()}</Badge>
                        <TypePill companyType={score.companyType} />
                        <CountryPill countryISO2={score.countryISO2} countryName={score.countryName} />
                      </div>
                    )}
                    
                    <button className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10">
                      + Add
                    </button>
                  </div>
                </div>

                {/* snippet */}
                {it.snippet && <p className="mt-2 text-sm text-[var(--muted)]">{it.snippet}</p>}

                {/* Detected brands */}
                {score?.detectedBrands?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="text-xs text-gray-500 mr-2">Detected brands:</div>
                    {score.detectedBrands.map((b) => (
                      <BrandBadge key={b} label={b} tone="maybe" />
                    ))}
                  </div>
                )}

                {/* Score details */}
                {score && (
                  <div className="mt-3 p-3 bg-black/20 rounded-lg">
                    <div className="text-xs text-gray-400 mb-2">LLM Analysis Details:</div>
                    <div className="text-xs space-y-1">
                      <div><strong>Confidence:</strong> {(score.confidence * 100).toFixed(0)}%</div>
                      <div><strong>Reasons:</strong> {score.reasons.join(', ')}</div>
                      <div><strong>Tags:</strong> {score.tags.join(', ')}</div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-8 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
        <h3 className="text-green-400 font-semibold mb-2">✅ Implementation Complete</h3>
        <ul className="text-sm text-green-300 space-y-1">
          <li>• LLM analyzes without hints - infers country, company type, and brands from content</li>
          <li>• Enhanced UI with proper badges for GOOD/MAYBE/BAD, company type, and country flags</li>
          <li>• Homepage content scraping with 5-second timeout (up to 2k characters)</li>
          <li>• Graceful fallback handling for missing data and API timeouts</li>
          <li>• Brand detection only from actual content mentions</li>
        </ul>
      </div>
    </div>
  );
}