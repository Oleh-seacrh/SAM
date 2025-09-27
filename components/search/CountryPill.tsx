"use client";

import { Badge } from "@/components/ui/Badge";
import { flagImgSrc, flagEmoji } from "@/lib/flags";

export function CountryPill({
  countryISO2,
  countryName,
}: {
  countryISO2: string | null;
  countryName: string | null;
}) {
  if (!countryISO2 && !countryName) {
    return null;
  }

  const displayText = countryName || countryISO2 || "";
  const flagUrl = countryISO2 ? flagImgSrc(countryISO2) : "";
  const fallbackFlag = countryISO2 ? flagEmoji(countryISO2) : "";

  return (
    <Badge tone="maybe" className="inline-flex items-center gap-1">
      {flagUrl ? (
        <img 
          src={flagUrl} 
          alt={`${countryISO2} flag`}
          className="w-4 h-3"
          onError={(e) => {
            // Fallback to emoji on image load error
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const span = document.createElement('span');
            span.textContent = fallbackFlag;
            span.className = 'text-xs';
            target.parentNode?.insertBefore(span, target);
          }}
        />
      ) : fallbackFlag ? (
        <span className="text-xs">{fallbackFlag}</span>
      ) : null}
      <span>{displayText}</span>
    </Badge>
  );
}