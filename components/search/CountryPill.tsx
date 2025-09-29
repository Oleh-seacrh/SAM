"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { flagImgSrc, flagEmoji } from "@/lib/flags";

export function CountryPill({
  countryISO2,
  countryName,
}: {
  countryISO2: string | null;
  countryName: string | null;
}) {
  if (!countryISO2 && !countryName) return null;

  const iso = countryISO2 || "";
  const displayText = countryName || iso;
  const [imgError, setImgError] = useState(false);
  const flagUrl = iso ? flagImgSrc(iso) : "";
  const fallback = iso ? flagEmoji(iso) : "";

  return (
    <Badge tone="maybe" className="inline-flex items-center gap-1">
      {flagUrl && !imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flagUrl}
          alt={`${iso} flag`}
          className="w-4 h-3"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      )}
      {(imgError || !flagUrl) && fallback && (
        <span className="text-xs leading-none">{fallback}</span>
      )}
      <span>{displayText}</span>
    </Badge>
  );
}
