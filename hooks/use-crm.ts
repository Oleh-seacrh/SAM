"use client";
import { useEffect, useMemo, useState } from "react";

export type CRMStatus = "New" | "Contacted" | "Qualified" | "Bad Fit";
export type SizeTag = "BIG" | "SMALL";

export type CRMItem = {
  id: string;

  // Core company info
  companyName: string;
  domain: string;
  url: string;
  country?: string;
  industry?: string;

  // Opportunity
  brand?: string;
  product?: string;
  quantity?: string;
  dealValueUSD?: number;

  // NEW
  sizeTag?: SizeTag;     // BIG | SMALL
  tags: string[];        // arbitrary labels

  // Contact (optional)
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;

  // Meta
  status: CRMStatus;
  note?: string;
  source?: "google" | "manual";
  addedAt: number;
  updatedAt: number;
};

const STORAGE_V4 = "sam_crm_v4";
const STORAGE_V3 = "sam_crm_v3";
const STORAGE_V2 = "sam_crm_v2";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useCRM() {
  const [items, setItems] = useState<CRMItem[]>([]);

  // load + migrate to V4 (adds sizeTag,tags)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const v4 = safeParse<CRMItem[]>(localStorage.getItem(STORAGE_V4), []);
    if (v4.length) {
      setItems(v4);
      return;
    }

    const v3 = safeParse<any[]>(localStorage.getItem(STORAGE_V3), []);
    if (v3.length) {
      const migrated: CRMItem[] = v3.map((x) => ({
        id: x.id ?? makeId(),
        companyName: x.companyName ?? x.title ?? x.domain ?? "Company",
        domain: x.domain,
        url: x.url,
        country: x.country,
        industry: x.industry,
        brand: x.brand,
        product: x.product,
        quantity: x.quantity,
        dealValueUSD: typeof x.dealValueUSD === "number" ? x.dealValueUSD : undefined,
        sizeTag: (x.sizeTag === "BIG" || x.sizeTag === "SMALL") ? x.sizeTag : undefined,
        tags: Array.isArray(x.tags) ? x.tags.filter(Boolean) : [],
        contactName: x.contactName,
        contactRole: x.contactRole,
        contactEmail: x.contactEmail,
        contactPhone: x.contactPhone,
        status: (x.status ?? "New") as CRMStatus,
        note: x.note,
        source: x.source,
        addedAt: x.addedAt ?? Date.now(),
        updatedAt: Date.now(),
      }));
      setItems(migrated);
      localStorage.setItem(STORAGE_V4, JSON.stringify(migrated));
      return;
    }

    const v2 = safeParse<any[]>(localStorage.getItem(STORAGE_V2), []);
    if (v2.length) {
      const migrated: CRMItem[] = v2.map((x) => ({
        id: x.id ?? makeId(),
        companyName: x.companyName ?? x.title ?? x.domain ?? "Company",
        domain: x.domain,
        url: x.url,
        country: x.country,
        industry: x.industry,
        brand: undefined,
        product: undefined,
        quantity: undefined,
        dealValueUSD: undefined,
        sizeTag: undefined,
        tags: [],
        contactName: x.contactName,
        contactRole: x.contactRole,
        contactEmail: x.contactEmail,
        contactPhone: x.contactPhone,
        status: (x.status ?? "New") as CRMStatus,
        note: x.note,
        source: x.source,
        addedAt: x.addedAt ?? Date.now(),
        updatedAt: Date.now(),
      }));
      setItems(migrated);
      localStorage.setItem(STORAGE_V4, JSON.stringify(migrated));
      return;
    }

    setItems([]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_V4, JSON.stringify(items));
  }, [items]);

  const add = (p: Omit<CRMItem, "id" | "addedAt" | "updatedAt">) => {
    setItems((prev) => {
      if (prev.some((x) => x.domain === p.domain)) return prev; // dedupe by domain
      return [{
        ...p,
        tags: Array.isArray(p.tags) ? p.tags.filter(Boolean) : [],
        id: makeId(),
        addedAt: Date.now(),
        updatedAt: Date.now()
      }, ...prev];
    });
  };

  const update = (id: string, patch: Partial<CRMItem>) => {
    setItems((prev) => prev.map((x) =>
      x.id === id
        ? {
            ...x,
            ...patch,
            tags: patch.tags ? patch.tags.filter(Boolean) : x.tags,
            updatedAt: Date.now(),
          }
        : x
    ));
  };

  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));
  const existsDomain = (domain: string) => items.some((x) => x.domain === domain);
  const byProduct = (needle: string) => {
    const q = needle.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => (x.product ?? "").toLowerCase().includes(q));
  };

  const sorted = useMemo(() => [...items].sort((a, b) => b.addedAt - a.addedAt), [items]);

  return { items: sorted, add, update, remove, existsDomain, byProduct, setItems };
}
