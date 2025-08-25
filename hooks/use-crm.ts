"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SizeTag = "BIG" | "SMALL";
export type CRMItem = {
  id: number;
  companyName: string;
  domain: string;
  url: string;
  country?: string;
  industry?: string;

  brand?: string;
  product?: string;
  quantity?: string;
  dealValueUSD?: number;

  sizeTag?: SizeTag;
  tags?: string[];

  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;

  status: "New" | "Contacted" | "Qualified" | "Bad Fit";
  note?: string;
  source?: string;

  addedAt: number;
  updatedAt: number;
};

type NewClient = Omit<CRMItem,"id"|"addedAt"|"updatedAt">;

const LS_KEY = "sam.crm.fallback.v1";

export function useCRM() {
  const [items, setItems] = useState<CRMItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // ---- helpers
  const saveFallback = (list: CRMItem[]) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
  };
  const loadFallback = (): CRMItem[] => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) as CRMItem[] : [];
    } catch { return []; }
  };

  // ---- load from API (fallback local)
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/clients", { cache: "no-store" });
      if (!r.ok) throw new Error("GET /api/clients failed");
      const j = await r.json();
      const list = (j.items ?? []) as CRMItem[];
      setItems(list);
      saveFallback(list);
    } catch {
      const list = loadFallback();
      setItems(list);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- ops
  async function add(payload: Partial<NewClient> & Pick<NewClient,"companyName"|"domain"|"url"|"status">) {
    // optimistic
    const temp: CRMItem = {
      id: Math.floor(Math.random()*1e9)*-1,
      companyName: payload.companyName,
      domain: payload.domain,
      url: payload.url,
      country: payload.country,
      industry: payload.industry,
      brand: payload.brand,
      product: payload.product,
      quantity: payload.quantity,
      dealValueUSD: payload.dealValueUSD,
      sizeTag: payload.sizeTag,
      tags: payload.tags ?? [],
      contactName: payload.contactName,
      contactRole: payload.contactRole,
      contactEmail: payload.contactEmail,
      contactPhone: payload.contactPhone,
      status: payload.status,
      note: payload.note,
      source: payload.source ?? "google",
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };
    setItems(prev => [temp, ...prev]);

    try {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: {"content-type":"application/json"},
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "POST failed");
      const id = j.item?.id ?? j.id;
      setItems(prev => [{...temp, id: id ?? temp.id}, ...prev.filter(x=>x.id!==temp.id)]);
    } catch {
      // keep in fallback so користувач нічого не втратить
      saveFallback([temp, ...items]);
    }
  }

  async function update(id: number, patch: Partial<NewClient>) {
    const prev = items;
    const idx = prev.findIndex(i => i.id === id);
    if (idx < 0) return;
    const next = [...prev];
    next[idx] = { ...prev[idx], ...patch, updatedAt: Date.now() };
    setItems(next);

    try {
      const r = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: {"content-type":"application/json"},
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "PATCH failed");
    } catch {
      setItems(prev); // rollback
    }
  }

  async function remove(id: number) {
    const prev = items;
    setItems(prev.filter(i => i.id !== id));
    try {
      const r = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("DELETE failed");
    } catch {
      setItems(prev); // rollback
    }
  }

  const existsDomain = (domain: string) => items.some(i => i.domain === domain);
  const byProduct = useCallback((filter: string) => {
    const f = filter.trim().toLowerCase();
    if (!f) return items;
    return items.filter(i => (i.product ?? "").toLowerCase().includes(f));
  }, [items]);

  useEffect(() => { if (loaded) saveFallback(items); }, [items, loaded]);

  return { items, add, update, remove, existsDomain, byProduct };
}
