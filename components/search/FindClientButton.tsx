"use client";

import { useState } from "react";
import { inferBrandsClient } from "@/lib/brandInferenceService";

type SearchItem = { link: string; title: string; snippet?: string };

interface Props {
  disabled?: boolean;
  provider: string;
  model?: string;
  items: SearchItem[];
  onResult: (byUrl: Record<string, string[]>) => void; // url -> brand names
}

export function FindClientButton({ disabled, provider, model, items, onResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!items?.length) return;
    setLoading(true);
    setErr(null);
    try {
      // 1) Тягнемо бренди з бекенду (єдиний source of truth)
      const r = await fetch("/api/settings/brands", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const brands: string[] = Array.isArray(j?.brands) ? j.brands : [];
      if (!brands.length) {
        setErr("No brands configured for this tenant.");
        return;
      }

      // 2) Інференс на сервері (LLM/фолбек)
      const matches = await inferBrandsClient({
        provider,
        model,
        items: items.map(it => ({ url: it.link, title: it.title, snippet: it.snippet || "" })),
        brands
      });

      // 3) Перетворюємо у зручну мапу url -> brands
      const byUrl: Record<string, string[]> = {};
      for (const m of matches) byUrl[m.url] = m.brands;
      onResult(byUrl);
    } catch (e: any) {
      setErr(e?.message || "Find failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={disabled || loading}
        className="w-full rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
      >
        {loading ? "Finding…" : "Find client"}
      </button>
      {err && <div className="text-xs text-red-400">{err}</div>}
    </div>
  );
}
