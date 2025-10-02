"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { flagImgSrc, flagEmoji } from "@/lib/flags";

export function CountryPill({
  countryISO2,
  countryName,
  countryConfidence,
}: {
  countryISO2: string | null;
  countryName: string | null;
  countryConfidence?: "HIGH" | "WEAK" | "LLM";
}) {
  if (!countryISO2 && !countryName) return null;
  const iso = (countryISO2 || "").toUpperCase();
  const display = countryName || iso;
  const [error, setError] = useState(false);
  const img = iso ? flagImgSrc(iso) : "";
  const fallback = iso ? flagEmoji(iso) : "";
  
  // Choose tone based on confidence
  const tone = countryConfidence === "HIGH" ? "good" : countryConfidence === "WEAK" ? "maybe" : "maybe";

  return (
    <Badge tone={tone} className="inline-flex items-center gap-1">
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
      {countryConfidence && (
        <span className="text-xs opacity-70">({countryConfidence})</span>
      )}
    </Badge>
  );
}
