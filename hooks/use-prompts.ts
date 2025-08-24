"use client";
import { useEffect, useMemo, useState } from "react";
import type { Provider } from "./use-settings";

export type SavedPrompt = {
  id: string;
  name: string;
  text: string;
  provider: Provider;
  model?: string;
  ts: number;
};

const STORAGE_KEY = "sam_prompts_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `pr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function usePrompts() {
  const [items, setItems] = useState<SavedPrompt[]>([]);
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const data = safeParse<{ items: SavedPrompt[]; lastUsedId: string | null }>(
      localStorage.getItem(STORAGE_KEY),
      { items: [], lastUsedId: null }
    );
    setItems(data.items || []);
    setLastUsedId(data.lastUsedId || null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, lastUsedId }));
  }, [items, lastUsedId]);

  const add = (p: Omit<SavedPrompt, "id" | "ts">) => {
    const next: SavedPrompt = { ...p, id: makeId(), ts: Date.now() };
    setItems(prev => [next, ...prev]);
    setLastUsedId(next.id);
  };

  const update = (id: string, patch: Partial<SavedPrompt>) =>
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));

  const remove = (id: string) => {
    setItems(prev => prev.filter(x => x.id !== id));
    setLastUsedId(prev => (prev === id ? null : prev));
  };

  const sorted = useMemo(() => [...items].sort((a,b)=>b.ts-a.ts), [items]);

  return { prompts: sorted, add, update, remove, lastUsedId, setLastUsedId, setAll: setItems };
}
