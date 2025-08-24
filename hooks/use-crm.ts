"use client";
import { useEffect, useMemo, useState } from "react";

export type CRMStatus = "New" | "Contacted" | "Qualified" | "Bad Fit";
export type CRMItem = {
  id: string;
  // Основне
  companyName: string;
  domain: string;
  url: string;            // https://example.com (homepage)
  country?: string;
  industry?: string;
  employees?: number;
  annualRevenueUSD?: number;

  // Контакт (необов'язковий)
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;

  // Метадані
  status: CRMStatus;
  tags?: string[];
  note?: string;
  source?: "google" | "manual";
  addedAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "sam_crm_v2";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useCRM() {
  const [items, setItems] = useState<CRMItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setItems(safeParse<CRMItem[]>(localStorage.getItem(STORAGE_KEY), []));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = (p: Omit<CRMItem, "id" | "addedAt" | "updatedAt">) => {
    setItems(prev => {
      if (prev.some(x => x.domain === p.domain)) return prev; // дедуп по домену
      return [{ ...p, id: makeId(), addedAt: Date.now(), updatedAt: Date.now() }, ...prev];
    });
  };

  const update = (id: string, patch: Partial<CRMItem>) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x));
  };

  const remove = (id: string) => setItems(prev => prev.filter(x => x.id !== id));
  const existsDomain = (domain: string) => items.some(x => x.domain === domain);
  const sorted = useMemo(() => [...items].sort((a, b) => b.addedAt - a.addedAt), [items]);

  return { items: sorted, add, update, remove, existsDomain, setItems };
}
