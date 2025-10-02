"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { flagImgSrc, flagEmoji } from "@/lib/flags";

export function CountryPill({
  countryISO2,
  countryName,
  confidence,
}: {
  countryISO2: string | null;
  countryName: string | null;
  confidence?: "HIGH" | "WEAK" | "LLM" | null;
}) {
  if (!countryISO2 && !countryName) return null;
  const iso = (countryISO2 || "").toUpperCase();
  const display = countryName || iso;
  const [error, setError] = useState(false);
  const img = iso ? flagImgSrc(iso) : "";
  const fallback = iso ? flagEmoji(iso) : "";
  
  // Show indicator for weak or LLM confidence
  const showIndicator = confidence === "WEAK" || confidence === "LLM";
  const indicatorSymbol = confidence === "WEAK" ? "≈" : "~";

  return (
    <Badge 
      tone="maybe" 
      className={`inline-flex items-center gap-1 ${showIndicator ? "border-dashed" : ""}`}
      title={showIndicator ? `Country confidence: ${confidence}` : undefined}
    >
      {img && !error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt={iso}
          className="w-4 h-3"
          loading="lazy"
          onError={() => setError(true)}
        />
      )}
      {(error || !img) && fallback && (
        <span className="text-xs leading-none">{fallback}</span>
      )}
      <span>{display}</span>
      {showIndicator && (
        <span className="text-xs opacity-70">{indicatorSymbol}</span>
      )}
    </Badge>
  );
}
