"use client";

import { useEffect, useMemo, useState } from "react";

export type CRMItem = {
  id: string;
  title: string;     // назва з пошуку
  url: string;       // канонічний URL (homepage)
  domain: string;    // example.com
  addedAt: number;   // Date.now()
  source?: "google" | "manual";
  note?: string;
};

const STORAGE_KEY = "sam_crm_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useCRM() {
  const [items, setItems] = useState<CRMItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = safeParse<CRMItem[]>(localStorage.getItem(STORAGE_KEY), []);
    setItems(current);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = (p: Omit<CRMItem, "id" | "addedAt">) => {
    setItems((prev) => {
      if (prev.some((x) => x.domain === p.domain)) return prev; // дедуп по домену
      return [{ ...p, id: makeId(), addedAt: Date.now() }, ...prev];
    });
  };

  const remove = (id: string) => setItems((prev) => prev.filter((x) => x.id !== id));

  const existsDomain = (domain: string) => items.some((x) => x.domain === domain);

  const sorted = useMemo(
    () => [...items].sort((a, b) => b.addedAt - a.addedAt),
    [items]
  );

  return { items: sorted, add, remove, existsDomain, raw: items, setItems };
}
