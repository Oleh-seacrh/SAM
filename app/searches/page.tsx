"use client";

import { useEffect, useMemo, useState } from "react";

type SearchItem = {
  title: string;
  link: string;
  displayLink: string;
  snippet?: string;
  homepage?: string;
};
type SearchResponse = {
  q: string;
  num: number;
  start: number;
  nextStart: number | null;
  prevStart: number | null;
  totalResults: number;
  items: SearchItem[];
};

export default function Page() {
  const [q, setQ] = useState("");
  const [start, setStart] = useState(1); // 1, 11, 21...
  const [num] = useState(10); // Google дозволяє до 10/req
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // історія запитів у межах сесії (на цій же сторінці)
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    if (data?.q) {
      setHistory((prev) => {
        if (prev[0] === data.q) return prev; // не дублюємо поспіль
        const next = [data.q, ...prev];
        return next.slice(0, 10);
      });
    }
  }, [data?.q]);

  async function runSearch(nextStart?: number) {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr(null);
    try {
      const s = nextStart ?? start;
      const url = `/api/search?q=${encodeURIComponent(query)}&num=${num}&start=${s}`;
      const r = await fetch(url);
      const j = (await r.json()) as SearchResponse | { error: string };
      if (!r.ok) throw new Error(("error" in j && j.error) || "Search failed");
      setData(j as SearchResponse);
      if (nextStart !== undefined) setStart(nextStart);
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const canPrev = useMemo(() => !!data?.prevStart, [data?.prevStart]);
  const canNext = useMemo(() => !!data?.nextStart, [data?.nextStart]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Searches</h1>

      {/* Форма пошуку (на тій же сторінці) */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setStart(1);
            runSearch(1);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 outline-none"
            placeholder="Введи ключові слова (наприклад: x-ray film distributor India)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
          >
            {loading ? "Пошук…" : "Шукати"}
          </button>
        </form>

        {/* Історія на цій же сторінці */}
        {history.length > 0 && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            <div className="mb-1">Останні запити:</div>
            <div className="flex flex-wrap gap-2">
              {history.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setQ(h);
                    setStart(1);
                    runSearch(1);
                  }}
                  className="rounded-full border border-white/10 px-2.5 py-1 hover:bg-white/10"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Повідомлення про помилку */}
      {err && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm">
          {err}
        </div>
      )}

      {/* Результати — залишаються на цій сторінці */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">
              Запит: <b>{data.q}</b> • Всього: {data.totalResults.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <button
                disabled={!canPrev || loading}
                onClick={() => canPrev && runSearch(data.prevStart!)}
                className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40"
              >
                ← Popередня
              </button>
              <button
                disabled={!canNext || loading}
                onClick={() => canNext && runSearch(data.nextStart!)}
                className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40"
              >
                Наступна →
              </button>
            </div>
          </div>

          <ul className="space-y-3">
            {data.items.map((it) => (
              <li
                key={it.link}
                className="rounded-xl bg-[var(--card)] p-4 border border-white/10"
              >
                <a
                  href={it.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-lg font-medium hover:underline"
                >
                  {it.title}
                </a>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {it.displayLink} {it.homepage && "• "}
                  {it.homepage && (
                    <a
                      href={it.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      homepage
                    </a>
                  )}
                </div>
                {it.snippet && (
                  <p className="mt-2 text-sm text-[var(--muted)]">{it.snippet}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
