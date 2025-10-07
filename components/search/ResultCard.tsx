"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { BrandBadge } from "@/components/search/BrandBadge";
import { CountryPill } from "@/components/search/CountryPill";
import { TypePill } from "@/components/search/TypePill";

/* ==================================================
 * Types
 * ================================================== */
export type SearchItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet?: string;
  homepage?: string;
};

export type Score = {
  label: "good" | "maybe" | "bad";
  confidence: number;
  reasons: string[];
  tags: string[];
  companyType: "manufacturer" | "distributor" | "dealer" | "other";
  countryISO2: string | null;
  countryName: string | null;
  detectedBrands: string[];
};

export type DeepResult = {
  pagesAnalyzed: number;
  contacts: {
    emails: string[];
    phones: string[];
  };
  detectedBrands: string[];
  country: {
    iso2: string | null;
    confidence: "HIGH" | "WEAK" | null;
    confidenceScore: number;
  };
};

/* ==================================================
 * ResultCard Component
 * ================================================== */
export function ResultCard({
  item,
  score,
  brandMatches = [],
  inCRM = false,
  onAddToCRM,
}: {
  item: SearchItem;
  score?: Score;
  brandMatches?: string[];
  inCRM?: boolean;
  onAddToCRM?: () => void;
}) {
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepResult, setDeepResult] = useState<DeepResult | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [addingToTasks, setAddingToTasks] = useState(false);

  const canonicalHomepage = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}`;
    } catch {
      return url;
    }
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      return url;
    }
  };

  const getDisplayUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      // Always add www. if not present
      return hostname.startsWith("www.") ? hostname : `www.${hostname}`;
    } catch {
      return url;
    }
  };

  const homepage = canonicalHomepage(item.homepage ?? item.link);
  const domain = getDomain(homepage);
  const displayUrl = getDisplayUrl(homepage);

  /* ---------------- Restore Deep Analysis from sessionStorage on mount ---------------- */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`deepAnalysis:${domain}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDeepResult(parsed);
      }
    } catch (e) {
      console.warn("Failed to restore deep analysis:", e);
    }
  }, [domain]);

  /* ---------------- Persist Deep Analysis to sessionStorage when it changes ---------------- */
  useEffect(() => {
    if (deepResult) {
      try {
        sessionStorage.setItem(`deepAnalysis:${domain}`, JSON.stringify(deepResult));
      } catch (e) {
        console.warn("Failed to save deep analysis:", e);
      }
    }
  }, [deepResult, domain]);

  // Merge brands: Quick (score) + Deep + brandMatches
  const quickBrands = score?.detectedBrands || [];
  const deepBrands = deepResult?.detectedBrands || [];
  const llmLower = new Set(quickBrands.map(b => b.toLowerCase()));
  const deepLower = new Set(deepBrands.map(b => b.toLowerCase()));
  const matchedFiltered = brandMatches.filter(
    b => !llmLower.has(b.toLowerCase()) && !deepLower.has(b.toLowerCase())
  );
  const orderedBrands = [...quickBrands, ...deepBrands, ...matchedFiltered];
  const visibleBrands = orderedBrands.slice(0, 3);
  const hiddenCount = orderedBrands.length - visibleBrands.length;

  // Country: use Deep if available, else Quick
  const displayCountry = deepResult?.country.iso2
    ? {
        iso2: deepResult.country.iso2,
        name: null,
        confidence: deepResult.country.confidence,
      }
    : score
    ? {
        iso2: score.countryISO2,
        name: score.countryName,
        confidence: null,
      }
    : null;

  // Company type: use Deep if companyType was UNKNOWN in Quick (not implemented here, but can be)
  const displayCompanyType = score?.companyType;

  const handleDeepAnalyze = async () => {
    setDeepLoading(true);
    setDeepError(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: homepage,
          domain,
          maxPages: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Crawl failed");
      setDeepResult(data);
    } catch (e: any) {
      setDeepError(e.message || "Deep analysis failed");
    } finally {
      setDeepLoading(false);
    }
  };

  const handleAddToTasks = async () => {
    setAddingToTasks(true);
    try {
      const r = await fetch("/api/prospects/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          homepage,
          companyName: item.title,
          title: `Outreach: ${item.title}`,
          snippet: item.snippet,
          scoreLabel: score?.label,
          scoreConfidence: score?.confidence,
          scoreReason: score?.reasons,
          companyType: score?.companyType,
          countryIso2: displayCountry?.iso2,
          countryName: displayCountry?.name,
          countryConfidence: displayCountry?.confidence,
          emails: deepResult?.contacts?.emails || [],
          phones: deepResult?.contacts?.phones || [],
          brands: [...quickBrands, ...deepBrands, ...brandMatches],
          pagesAnalyzed: deepResult?.pagesAnalyzed || 0,
          deepAnalyzedAt: deepResult ? new Date().toISOString() : null,
          columnKey: "to_contact",
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          alert("This prospect already exists in Tasks");
        } else {
          throw new Error(data.error || "Failed to add to tasks");
        }
      } else {
        alert("Added to Prospect Tasks!");
      }
    } catch (e: any) {
      alert(e.message || "Failed to add to tasks");
    } finally {
      setAddingToTasks(false);
    }
  };

  return (
    <li className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            {item.title}
          </a>
          <div className="text-xs text-[var(--muted)] mt-1">
            <a
              href={homepage}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {displayUrl}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {score && (
            <div className="flex gap-2 flex-wrap">
              <Badge tone={score.label}>{score.label.toUpperCase()}</Badge>
              {displayCompanyType && <TypePill companyType={displayCompanyType} />}
              {displayCountry && (
                <CountryPill
                  countryISO2={displayCountry.iso2}
                  countryName={displayCountry.name}
                  confidence={displayCountry.confidence}
                />
              )}
            </div>
          )}
          <button
            onClick={handleDeepAnalyze}
            disabled={deepLoading || !!deepResult}
            className="rounded-md text-sm px-3 py-1.5 border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50"
          >
            {deepLoading ? "Analyzing…" : deepResult ? "✓ Deep Analyzed" : "🔍 Deep Analyze"}
          </button>
          <button
            onClick={handleAddToTasks}
            disabled={addingToTasks}
            className="rounded-md text-sm px-3 py-1.5 border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 whitespace-nowrap"
          >
            {addingToTasks ? "Adding..." : "+ Tasks"}
          </button>
          {inCRM ? (
            <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">
              In CRM
            </span>
          ) : (
            onAddToCRM && (
              <button
                onClick={onAddToCRM}
                className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10"
              >
                + Add
              </button>
            )
          )}
        </div>
      </div>

      {item.snippet && (
        <p className="mt-2 text-sm text-[var(--muted)]">{item.snippet}</p>
      )}

      {deepError && (
        <div className="mt-2 text-xs text-red-400">{deepError}</div>
      )}

      {orderedBrands.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {visibleBrands.map(b => (
            <BrandBadge key={b} label={b} tone="maybe" />
          ))}
          {hiddenCount > 0 && (
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] self-center">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}

      {/* Quick Analysis Details (LLM) */}
      {score && (
        <div className="mt-3 p-3 bg-black/20 rounded-lg">
          <div className="text-xs text-[var(--muted)] mb-2">
            Quick Analysis Details:
          </div>
          <div className="text-xs space-y-1">
            <div>
              <strong>Confidence:</strong> {(score.confidence * 100).toFixed(0)}%
            </div>
            {score.reasons?.length > 0 && (
              <div>
                <strong>Reasons:</strong> {score.reasons.join(", ")}
              </div>
            )}
            {score.tags?.length > 0 && (
              <div>
                <strong>Tags:</strong> {score.tags.join(", ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deep Analysis Results */}
      {deepResult && (
        <div className="mt-3 p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg">
          <div className="text-xs text-purple-300 mb-2 font-semibold">
            Deep Analysis Results
            {deepResult.pagesAnalyzed > 0 && (
              <span className="ml-1 font-normal">
                (analyzed {deepResult.pagesAnalyzed} page{deepResult.pagesAnalyzed > 1 ? "s" : ""})
              </span>
            )}
          </div>
          <div className="text-xs space-y-2">
            {/* Country */}
            {deepResult.country.iso2 && (
              <div>
                <strong>Country:</strong> {deepResult.country.iso2}
                {deepResult.country.confidence && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                    ({deepResult.country.confidence} - {(deepResult.country.confidenceScore * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            )}

            {/* Brands */}
            {deepResult.detectedBrands.length > 0 && (
              <div>
                <strong>Brands:</strong> {deepResult.detectedBrands.join(", ")}
              </div>
            )}

            {/* Contacts */}
            {(deepResult.contacts.emails.length > 0 || deepResult.contacts.phones.length > 0) && (
              <div>
                <strong>Contacts:</strong>
                {deepResult.contacts.emails.length > 0 && (
                  <div className="ml-2 mt-1">
                    <span className="opacity-70">Emails:</span>{" "}
                    {deepResult.contacts.emails.slice(0, 3).join(", ")}
                    {deepResult.contacts.emails.length > 3 && (
                      <span className="opacity-50"> +{deepResult.contacts.emails.length - 3} more</span>
                    )}
                  </div>
                )}
                {deepResult.contacts.phones.length > 0 && (
                  <div className="ml-2 mt-1">
                    <span className="opacity-70">Phones:</span>{" "}
                    {deepResult.contacts.phones.slice(0, 3).join(", ")}
                    {deepResult.contacts.phones.length > 3 && (
                      <span className="opacity-50"> +{deepResult.contacts.phones.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
