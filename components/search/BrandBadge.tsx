"use client";

import { Badge } from "@/components/ui/Badge";

export function BrandBadge({
  label,
  count,
  tone = "maybe",
}: {
  label: string;
  count?: number;
  tone?: "good" | "bad" | "maybe";
}) {
  return (
    <Badge tone={tone}>
      {label}
      {typeof count === "number" ? <span className="ml-1 opacity-80">({count})</span> : null}
    </Badge>
  );
}
