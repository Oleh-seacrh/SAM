"use client";
import { useEffect, useMemo, useState } from "react";

export type SavedItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet?: string;
  homepage?: string;
  domain: string;
};

export type SearchSession = {
  id: string;
  q: string;
  ts: number;              // timestamp
  num: number;             // results per page (10)
  start: number;           // start index
  totalResults: number;
  items: SavedItem[];      // збережена видача
};

const STORAGE_KEY = "sam_sessions_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SearchSession[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSessions(safeParse<SearchSession[]>(localStorage.getItem(STORAGE_KEY), []));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const add = (s: Omit<SearchSession, "id" | "ts">) => {
    setSessions(prev => {
      const next: SearchSession = { ...s, id: makeId(), ts: Date.now() };
      // зберігаємо тільки останні 30 сесій
      return [next, ...prev].slice(0, 30);
    });
  };

  const remove = (id: string) => setSessions(prev => prev.filter(x => x.id !== id));
  const clear = () => setSessions([]);

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.ts - a.ts), [sessions]);

  return { sessions: sorted, add, remove, clear };
}
