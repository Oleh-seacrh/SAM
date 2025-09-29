"use client";

import { Badge } from "@/components/ui/Badge";

export type CompanyType = "manufacturer" | "distributor" | "dealer" | "other";

const LABEL: Record<CompanyType, string> = {
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  dealer: "Dealer",
  other: "Other",
};

const TONE: Record<CompanyType, "good" | "maybe" | "bad"> = {
  manufacturer: "good",
  distributor: "maybe",
  dealer: "maybe",
  other: "bad",
};

export function TypePill({ companyType }: { companyType?: CompanyType | null }) {
  if (!companyType) return null;
  const tone = TONE[companyType] || "maybe";
  const text = LABEL[companyType] || companyType;
  return <Badge tone={tone}>{text}</Badge>;
}
