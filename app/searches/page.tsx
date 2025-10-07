"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/hooks/use-crm";
import { useSessions, SavedItem } from "@/hooks/use-sessions";
import { useSettings } from "@/hooks/use-settings";
import { usePrompts } from "@/hooks/use-prompts";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { FindClientButton } from "@/components/search/FindClientButton";
import { ResultCard } from "@/components/search/ResultCard";

/* ==================================================
 * Config / Debug
 * ================================================== */
const ENABLE_SCORE_DEBUG = false;

/* ==================================================
 * Types
 * ================================================== */
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

type Score = {
  label: "good" | "maybe" | "bad";
  confidence: number;
  reasons: string[];
  tags: string[];
  companyType: "manufacturer" | "distributor" | "dealer" | "other";
  countryISO2: string | null;
  countryName: string | null;
  detectedBrands: string[];
};

type ScoresByDomain = Record<string, Score>;

/* ==================================================
 * Utility (frontend normalization safety net)
 * ================================================== */
function normalizeScores(raw: any): ScoresByDomain {
  const src = raw?.scoresByDomain || raw?.scores || {};
  const out: ScoresByDomain = {};
  for (const [k, v] of Object.entries<any>(src)) {
    if (!v || typeof v !== "object") continue;
    const domain = k.replace(/^www\./i, "").toLowerCase();
    const companyType =
      v.companyType || v.company_type || v.type || "other";
    const countryISO2 =
      v.countryISO2 && /^[A-Z]{2}$/i.test(v.countryISO2)
        ? v.countryISO2.toUpperCase()
        : null;
    const countryName = v.countryName || v.country_name || null;
    const detectedBrands = Array.isArray(v.detectedBrands)
      ? Array.from(
          new Set(
            v.detectedBrands
              .map((b: any) => String(b).trim())
              .filter((b: string) => b.length > 0 && b.length <= 80)
          )
        )
      : [];
    out[domain] = {
      label: ["good", "maybe", "bad"].includes(v.label) ? v.label : "maybe",
      confidence:
        typeof v.confidence === "number" &&
        v.confidence >= 0 &&
        v.confidence <= 1
          ? v.confidence
          : 0.5,
      reasons: Array.isArray(v.reasons) ? v.reasons.slice(0, 10) : [],
      tags: Array.isArray(v.tags) ? v.tags.slice(0, 25) : [],
      companyType:
        ["manufacturer", "distributor", "dealer", "other"].includes(companyType)
          ? companyType
          : "other",
      countryISO2,
      countryName: countryISO2 ? countryName : countryName && countryName.length >= 3 ? countryName : null,
      detectedBrands,
    };
  }
  return out;
}

function pickScore(scores: ScoresByDomain, rawDomain: string): Score | undefined {
  const base = rawDomain.replace(/^www\./i, "").toLowerCase();
  return (
    scores[base] ||
    scores["www." + base] ||
    scores[base.replace(/^www\./, "")] ||
    undefined
  );
}

/* ==================================================
 * Component
 * ================================================== */
export default function SearchesPage() {
  const [q, setQ] = useState("");
  // Видалено: const [num, setNum] = useState(10);
  const [start, setStart] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { add: addCRM, existsDomain } = useCRM();
  const { add: addSession } = useSessions();
  const { settings, setLastSearch, setLLM, setAutoRun } = useSettings();
  const { prompts, add: addPrompt, remove: removePrompt, lastUsedId, setLastUsedId, loading: promptsLoading } =
    usePrompts();

  // LLM controls (now from settings)
  const [prompt, setPrompt] = useState<string>(
    "Target: B2B distributors/manufacturers of X-ray film and related medical imaging consumables. Exclude blogs, news, generic marketplaces."
  );
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoresByDomain>({});

  // brandMatches (configured inference)
  const [brandMatches, setBrandMatches] = useState<Record<string, string[]>>({});

  // History
  const [history, setHistory] = useState<string[]>([]);

  // Add-to-CRM modal
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({});
  const [newName, setNewName] = useState("");
  const [tagsText, setTagsText] = useState("");

  /* ---------------- Restore from sessionStorage on mount ---------------- */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("searches:data");
      if (saved) {
        const parsed = JSON.parse(saved);
        setData(parsed.data);
        setScores(parsed.scores || {});
        setBrandMatches(parsed.brandMatches || {});
      }
    } catch (e) {
      console.warn("Failed to restore search state:", e);
    }
  }, []);

  /* ---------------- Persist to sessionStorage when data/scores/brandMatches change ---------------- */
  useEffect(() => {
    if (data) {
      try {
        sessionStorage.setItem(
          "searches:data",
          JSON.stringify({ data, scores, brandMatches })
        );
      } catch (e) {
        console.warn("Failed to save search state:", e);
      }
    }
  }, [data, scores, brandMatches]);

  /* ---------------- Effects ---------------- */
  useEffect(() => {
    if (!settings) return;
    settings.lastQuery && setQ(settings.lastQuery);
    settings.lastStart && setStart(settings.lastStart);
    // Видалено: settings.lastNum && setNum(settings.lastNum);
    settings.lastProvider && setProvider(settings.lastProvider);
    settings.lastModel && setModel(settings.lastModel);
    settings.lastPrompt && setPrompt(settings.lastPrompt);
  }, [settings]);

  useEffect(() => {
    if (!settings?.autoRunLastSearch) return;
    if (settings.lastQuery) {
      runSearch(settings.lastStart || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoRunLastSearch]);

  useEffect(() => {
    if (data?.q) {
      setHistory(p => (p[0] === data.q ? p : [data.q, ...p].slice(0, 10)));
    }
  }, [data?.q]);

  /* ---------------- Actions ---------------- */
  async function runSearch(nextStart?: number) {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr(null);
    try {
      // Видалено параметр &num=...
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(query)}&start=${nextStart || 1}`
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Search failed");
      setData(j as SearchResponse);
      setScores({});
      setBrandMatches({});
      // Оновлено виклик setLastSearch без num
      setLastSearch(query, j.start);

      // session snapshot
      const savedItems: SavedItem[] = (j.items ?? []).map((it: any) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return {
          title: it.title,
          link: it.link,
          displayLink: it.displayLink,
          snippet: it.snippet,
          homepage,
          domain: getDomain(homepage),
        };
      });
      addSession({
        q: j.q,
        num: j.num, // залишено якщо бекенд і далі повертає num
        start: j.start,
        totalResults: j.totalResults || 0,
        items: savedItems,
      });
      if (nextStart !== undefined) setStart(nextStart);
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!data?.items?.length) return;
    setScoring(true);
    setErr(null);
    try {
      const items = data.items.map(it => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return {
          title: it.title,
          snippet: it.snippet,
          homepage,
          domain: getDomain(homepage),
        };
      });

      const r = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider: settings.llm?.provider || "openai", 
          model: settings.llm?.model || undefined, 
          prompt, 
          items 
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Scoring failed");
      const normalized = normalizeScores(j);
      if (ENABLE_SCORE_DEBUG) console.log("LLM RAW SCORE RESP", j, "NORMALIZED", normalized);
      setScores(normalized);
    } catch (e: any) {
      setErr(e.message || "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  function openAddModal(it: SearchItem) {
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft({
      companyName: it.title?.slice(0, 80) || domain,
      domain,
      status: "New",
      source: "google",
      brand: "",
      product: "",
      quantity: "",
      dealValueUSD: undefined,
      country: "",
      industry: "",
      note: "",
      sizeTag: "",
      tags: [],
    });
    setTagsText("");
    setOpen(true);
  }

  function submitAdd() {
    if (!draft.companyName || !draft.domain) return;
    const dealValue = draft.dealValueUSD ? Number(draft.dealValueUSD) : undefined;
    const tags = tagsText
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    addCRM({
      ...draft,
      dealValueUSD: dealValue,
      sizeTag: draft.sizeTag || undefined,
      tags,
    });
    setOpen(false);
  }

  /* ---------------- Memo ---------------- */
  const canPrev = useMemo(() => !!data?.prevStart, [data?.prevStart]);
  const canNext = useMemo(() => !!data?.nextStart, [data?.nextStart]);

  /* ==================================================
   * Render
   * ================================================== */
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Find Client</h1>
        <a href="/settings?tab=search" className="text-sm underline opacity-80">
          Settings →
        </a>
      </div>

      {err && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-400">
          {err}
        </div>
      )}

      {/* Search Form */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <form
          onSubmit={e => {
            e.preventDefault();
            setStart(1);
            runSearch(1);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 outline-none"
            placeholder="Enter keywords (e.g., x-ray film distributor germany)"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {/* Вилучене поле для кількості результатів */}
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(settings?.autoRunLastSearch)}
              onChange={e => setAutoRun(e.target.checked)}
            />
            Auto-run last search on load
          </label>
            {settings?.lastQuery && (
            <span>
              Last: <b>{settings.lastQuery}</b>
            </span>
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            <div className="mb-1">Recent queries:</div>
            <div className="flex flex-wrap gap-2">
              {history.map(h => (
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

      {/* AI Panel */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 space-y-4">
        <label className="text-sm block">
          <span className="mb-1 inline-block font-medium">Prompt</span>
          <textarea
            className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe ideal prospect criteria…"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={analyze}
            disabled={!data?.items?.length || scoring}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50 transition"
          >
            {scoring ? "Analyzing…" : "Analyze current results"}
          </button>
          <FindClientButton
            provider={settings.llm?.provider || "openai"}
            model={settings.llm?.model || undefined}
            items={(data?.items || []).map(it => ({
              link: it.link,
              title: it.title,
              snippet: it.snippet || "",
            }))}
            onResult={byUrl => setBrandMatches(byUrl)}
            disabled={!data?.items?.length}
          />
        </div>

        {/* Prompt Library */}
        <div className="pt-3 border-t border-white/10 space-y-3">
          <label className="text-sm block">
            <span className="mb-1 inline-block font-medium">Saved Prompts</span>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                value={lastUsedId ?? ""}
                onChange={e => setLastUsedId(e.target.value || null)}
                disabled={promptsLoading}
              >
                <option value="">{promptsLoading ? "Loading..." : "— Select —"}</option>
                {prompts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="rounded-lg px-4 py-2 bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  const p = prompts.find(x => x.id === lastUsedId);
                  if (!p) return;
                  setPrompt(p.text);
                }}
                disabled={!lastUsedId}
              >
                Load
              </button>
              <button
                className="rounded-lg px-4 py-2 bg-red-600/80 hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => lastUsedId && removePrompt(lastUsedId)}
                disabled={!lastUsedId}
              >
                Delete
              </button>
            </div>
          </label>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="Name to save current prompt…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <button
              className="rounded-lg px-4 py-2 bg-green-600 hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (!newName.trim()) return;
                addPrompt({
                  name: newName.trim(),
                  text: prompt,
                  provider: settings.llm?.provider || "openai",
                  model: settings.llm?.model || undefined,
                });
                setNewName("");
              }}
              disabled={!newName.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">
              Query: <b>{data.q}</b> • Total: {data.totalResults.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <button
                disabled={!canPrev || loading}
                onClick={() => canPrev && runSearch(data.prevStart!)}
                className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                disabled={!canNext || loading}
                onClick={() => canNext && runSearch(data.nextStart!)}
                className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>

          <ul className="space-y-3">
            {data.items.map(it => {
              const homepage = canonicalHomepage(it.homepage ?? it.link);
              const domain = getDomain(homepage).replace(/^www\./i, "");
              const score = pickScore(scores, domain);
              const inCRM = existsDomain(domain);

              return (
                <ResultCard
                  key={it.link}
                  item={it}
                  score={score}
                  brandMatches={brandMatches[it.link] || []}
                  inCRM={inCRM}
                  onAddToCRM={() => openAddModal(it)}
                />
              );
            })}
          </ul>

          {!scoring && Object.keys(scores).length === 0 && data.items.length > 0 && (
            <div className="text-xs text-yellow-400">
              No LLM analysis yet (run Analyze).
            </div>
          )}
        </div>
      )}

      {/* Add-to-CRM Modal */}
      <Modal open={open} onClose={() => setOpen(false)}>
        <h3 className="text-lg font-semibold mb-3">Add to CRM</h3>
        <div className="space-y-4">
          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">
            Company
          </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Company"
              value={draft.companyName || ""}
              onChange={v => setDraft((d: any) => ({ ...d, companyName: v }))}
            />
            <Field
              label="Country"
              value={draft.country || ""}
              onChange={v => setDraft((d: any) => ({ ...d, country: v }))}
            />
            <Field
              label="Industry"
              value={draft.industry || ""}
              onChange={v => setDraft((d: any) => ({ ...d, industry: v }))}
            />
            <Field
              label="Domain"
              value={draft.domain || ""}
              onChange={v => setDraft((d: any) => ({ ...d, domain: v }))}
            />
            <Select
              label="Status"
              value={draft.status || "New"}
              onChange={v => setDraft((d: any) => ({ ...d, status: v }))}
              options={["New", "Contacted", "Qualified", "Bad Fit"]}
            />
            <Field
              label="Size"
              value={draft.sizeTag || ""}
              onChange={v => setDraft((d: any) => ({ ...d, sizeTag: v }))}
            />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">
            Deal
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field
              label="Product/Brand"
              value={draft.brand || ""}
              onChange={v => setDraft((d: any) => ({ ...d, brand: v }))}
            />
            <Field
              label="Product"
              value={draft.product || ""}
              onChange={v => setDraft((d: any) => ({ ...d, product: v }))}
            />
            <Field
              label="Quantity"
              value={draft.quantity || ""}
              onChange={v => setDraft((d: any) => ({ ...d, quantity: v }))}
            />
          </div>

          <Field
            label="Deal value (USD)"
            type="number"
            value={String(draft.dealValueUSD ?? "")}
            onChange={v =>
              setDraft((d: any) => ({
                ...d,
                dealValueUSD: v ? Number(v) : undefined,
              }))
            }
          />

          <Field
            label="Note"
            value={draft.note || ""}
            onChange={v => setDraft((d: any) => ({ ...d, note: v }))}
          />
          <Field
            label="Tags (comma-separated)"
            value={tagsText}
            onChange={v => setTagsText(v)}
            placeholder="priority, repeat-buyer, EMEA"
          />

          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={submitAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Add to CRM
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ==================================================
 * Small Form Helpers
 * ================================================== */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-sm block">
      <span className="mb-1 inline-block">{label}</span>
      <input
        className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
        value={value}
        onChange={e => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-sm block">
      <span className="mb-1 inline-block">{label}</span>
      <select
        className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
