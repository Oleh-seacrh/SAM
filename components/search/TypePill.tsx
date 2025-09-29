"use client";

import { Badge } from "@/components/ui/Badge";

type CompanyType = "manufacturer" | "distributor" | "dealer" | "other";

const typeLabels: Record<CompanyType, string> = {
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  dealer: "Dealer",
  other: "Other",
};

const typeColors: Record<CompanyType, "good" | "maybe" | "bad"> = {
  manufacturer: "good",
  distributor: "maybe",
  dealer: "maybe",
  other: "bad",
};

export function TypePill({ companyType }: { companyType: CompanyType | null | undefined }) {
  if (!companyType) return null;
  const tone = typeColors[companyType] || "maybe";
  const label = typeLabels[companyType] || companyType;
  return <Badge tone={tone}>{label}</Badge>;
}
