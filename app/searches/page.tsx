"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/hooks/use-crm";
import { useSessions, SavedItem } from "@/hooks/use-sessions";
import { useSettings } from "@/hooks/use-settings";
import { usePrompts } from "@/hooks/use-prompts";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

// NEW: кнопка інференсу брендів та бейджі
import FindClientButton from "@/components/search/FindClientButton";
import BrandBadge from "@/components/search/BrandBadge";

/* ---------- types ---------- */
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

type Score = "GOOD" | "MAYBE" | "BAD";
type ScoresByDomain = Record<string, Score | undefined>;

type DraftOrg = {
  companyName: string;
  domain: string;
  status: "New" | "Contacted" | "Qualified" | "Bad Fit";
  source: string; // e.g. "google"
  brand: string;
  product: string;
  quantity: string;
  dealValueUSD?: number;
  country: string;
  industry: string;
  note: string;
  sizeTag?: "" | "BIG";
  tags: string[];
};

/* ---------- page component ---------- */
export default function SearchesPage() {
  // core state
  const [q, setQ] = useState("");
  const [num, setNum] = useState(10);
  const [start, setStart] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { add: addCRM, existsDomain } = useCRM();
  const { add: addSession } = useSessions();
  const { settings, setLastSearch, setAutoRun } = useSettings();
  const { prompts, add: addPrompt, remove: removePrompt, lastUsedId, setLastUsedId } = usePrompts();

  // LLM UI
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [model, setModel] = useState<string>(""); // опційно, можна лишати порожнім
  const [prompt, setPrompt] = useState<string>(
    "Target: B2B distributors/manufacturers of X-ray film and related medical imaging consumables. Exclude blogs, news, generic marketplaces."
  );
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoresByDomain>({});

  // NEW: результати інференсу брендів (url -> brands[])
  const [brandMatches, setBrandMatches] = useState<Record<string, string[]>>({});

  // NEW: prompt library save name
  const [newName, setNewName] = useState("");

  // history chips
  const [history, setHistory] = useState<string[]>([]);

  // restore last search + auto-run
  useEffect(() => {
    if (!settings?.autoRunLastSearch) return;
    if (settings?.lastQuery) {
      setQ(settings.lastQuery);
      setStart(settings.lastStart || 1);
      runSearch(settings.lastStart || 1, settings.lastQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoRunLastSearch]);

  useEffect(() => {
    if (data?.q) {
      setHistory((p) => (p[0] === data.q ? p : [data.q, ...p].slice(0, 10)));
    }
  }, [data?.q]);

  /* ---------- actions ---------- */
  async function runSearch(nextStart?: number, explicitQ?: string) {
    const query = (explicitQ ?? q).trim();
    if (!query) return;
    setLoading(true);
    setErr(null);
    try {
      const s = nextStart ?? start;
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&num=${num}&start=${s}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Search failed");

      // нормалізуємо items: заповнюємо homepage та домен
      const items = (j.items ?? []).map((it: any) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return {
          title: it.title,
          link: it.link,
          displayLink: it.displayLink,
          snippet: it.snippet,
          homepage,
        } as SearchItem;
      });

      const merged: SearchResponse = {
        q: j.q,
        num: j.num,
        start: j.start,
        nextStart: j.nextStart ?? null,
        prevStart: j.prevStart ?? null,
        totalResults: j.totalResults || 0,
        items,
      };
      setData(merged);

      // скидаємо попередні оцінки й інференс брендів для нової видачі
      setScores({});
      setBrandMatches({});

      // persist last search
      setLastSearch(query, merged.start, merged.num);

      // save session snapshot
      const savedItems: SavedItem[] = items.map((it) => {
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
        q: merged.q,
        num: merged.num,
        start: merged.start,
        totalResults: merged.totalResults,
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
      const items = data.items.map((it) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return {
          link: it.link,
          title: it.title,
          snippet: it.snippet || "",
          homepage,
        };
      });

      const r = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model: model || undefined, prompt, items }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Scoring failed");
      setScores(j.scores || {});
    } catch (e: any) {
      setErr(e.message || "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  const canPrev = useMemo(() => !!data?.prevStart, [data?.prevStart]);
  const canNext = useMemo(() => !!data?.nextStart, [data?.nextStart]);

  /* ---------- Add-to-CRM modal ---------- */
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftOrg>({
    companyName: "",
    domain: "",
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
  const [tagsText, setTagsText] = useState("");

  function openAddModal(it: SearchItem) {
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft((d) => ({
      ...d,
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
    }));
    setTagsText("");
    setOpen(true);
  }

  function submitAdd() {
    if (!draft.companyName || !draft.domain) return;
    const dealValue = draft.dealValueUSD ? Number(draft.dealValueUSD) : undefined;
    const tags = tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = { ...draft, dealValueUSD: dealValue, sizeTag: draft.sizeTag || undefined, tags };
    addCRM(payload);
    setOpen(false);
  }

  /* ---------- render ---------- */
  return (
    <div className="p-4 space-y-4">
      {/* Search form + autorun toggle */}
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
            placeholder="Enter keywords (e.g., x-ray film distributor India)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings?.autoRunLastSearch)}
            onChange={(e) => setAutoRun(e.target.checked)}
          />
          Auto-run last search on load
        </label>

        {settings?.lastQuery && (
          <div className="mt-1 text-sm text-[var(--muted)]">
            Last: <b>{settings.lastQuery}</b>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-1 text-sm text-[var(--muted)]">
          <div className="mb-1">Recent queries:</div>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h}
                onClick={() => {
                  setQ(h);
                  setStart(1);
                  runSearch(1, h);
                }}
                className="rounded-full border border-white/10 px-2.5 py-1 hover:bg-white/10"
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI panel + prompt library + Find client */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Provider</span>
            <select
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 inline-block">Model (optional)</span>
            <input
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="auto (e.g., gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              onClick={analyze}
              disabled={!data?.items?.length || scoring}
              className="w-full rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
            >
              {scoring ? "Analyzing…" : "Analyze current results"}
            </button>

            {/* NEW: Find client (brand inference) */}
            <FindClientButton
              provider={provider}
              model={model || undefined}
              items={(data?.items || []).map((it) => ({
                link: it.link,
                title: it.title,
                snippet: it.snippet || "",
              }))}
              onResult={(byUrl) => setBrandMatches(byUrl)}
            />
          </div>
        </div>

        <label className="text-sm block">
          <span className="mb-1 inline-block">Prompt</span>
          <textarea
            className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe ideal prospect criteria…"
          />
        </label>

        {/* Prompt library */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Saved prompts</span>
            <select
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={lastUsedId ?? ""}
              onChange={(e) => setLastUsedId(e.target.value || null)}
            >
              <option value="">— Select —</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={() => {
                const p = prompts.find((x) => x.id === lastUsedId);
                if (!p) return;
                setProvider(p.provider);
                setModel(p.model || "");
                setPrompt(p.text);
              }}
              disabled={!lastUsedId}
            >
              Load
            </button>
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={() => lastUsedId && removePrompt(lastUsedId)}
              disabled={!lastUsedId}
            >
              Delete
            </button>
          </div>

          <label className="text-sm">
            <span className="mb-1 inline-block">Save current as…</span>
            <input
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="Name to save current prompt…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              className="mt-2 rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={() => {
                if (!newName.trim()) return;
                addPrompt({ name: newName.trim(), text: prompt, provider, model: model || undefined });
                setNewName("");
              }}
            >
              Save
            </button>
          </label>
        </div>
      </div>

      {/* results */}
      {err && (
        <div className="text-sm text-red-400">
          {err}
        </div>
      )}

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
            {data.items.map((it) => {
              const homepage = canonicalHomepage(it.homepage ?? it.link);
              const domain = getDomain(homepage);
              const score = scores[domain];
              const inCRM = existsDomain(domain);
              const brands = brandMatches[it.link] || []; // інференс повертає ключем саме вихідний URL

              return (
                <li key={it.link} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <a href={it.link} target="_blank" rel="noreferrer" className="text-lg font-medium hover:underline">
                        {it.title}
                      </a>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {it.displayLink} •{" "}
                        <a href={homepage} target="_blank" rel="noreferrer" className="hover:underline">
                          {domain}
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {score && <Badge tone={score === "GOOD" ? "good" : score === "MAYBE" ? "maybe" : "bad"}>{score}</Badge>}
                      {inCRM ? (
                        <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">In CRM</span>
                      ) : (
                        <button
                          onClick={() => openAddModal(it)}
                          className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>

                  {/* snippet */}
                  {it.snippet && <p className="mt-2 text-sm text-[var(--muted)]">{it.snippet}</p>}

                  {/* NEW: інференсовані бренди як бейджі */}
                  {!!brands.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {brands.map((b) => (
                        <BrandBadge key={b} label={b} tone="maybe" />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Add-to-CRM modal */}
      <Modal open={open} onClose={() => setOpen(false)}>
        <h3 className="text-lg font-semibold mb-3">Add to CRM</h3>

        <div className="space-y-4">
          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Company</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company" value={draft.companyName || ""} onChange={(v) => setDraft((d) => ({ ...d, companyName: v }))} />
            <Field label="Country" value={draft.country || ""} onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
            <Field label="Industry" value={draft.industry || ""} onChange={(v) => setDraft((d) => ({ ...d, industry: v }))} />
            <Field label="Domain" value={draft.domain || ""} onChange={(v) => setDraft((d) => ({ ...d, domain: v }))} />
            <Select
              label="Status"
              value={draft.status || "New"}
              onChange={(v) => setDraft((d) => ({ ...d, status: v as DraftOrg["status"] }))}
              options={["New", "Contacted", "Qualified", "Bad Fit"]}
            />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Opportunity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Brand" value={draft.brand || ""} onChange={(v) => setDraft((d) => ({ ...d, brand: v }))} />
            <Field label="Product" value={draft.product || ""} onChange={(v) => setDraft((d) => ({ ...d, product: v }))} />
            <Field label="Quantity" value={draft.quantity || ""} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} />
            <Field
              label="Deal value (USD)"
              type="number"
              value={String(draft.dealValueUSD ?? "")}
              onChange={(v) => setDraft((d) => ({ ...d, dealValueUSD: v ? Number(v) : undefined }))}
            />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Sizing & Tags</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Size tag"
              value={draft.sizeTag || ""}
              onChange={(v) => setDraft((d) => ({ ...d, sizeTag: (v as DraftOrg["sizeTag"]) || "" }))}
              options={["", "BIG"]}
            />
            <label className="block text-sm">
              <span className="mb-1 inline-block">Tags (comma-separated)</span>
              <input
                className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                placeholder="priority,repeat-buyer,EMEA"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm mb-1">Note</label>
            <textarea
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
              value={draft.note || ""}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 border border-white/10">
              Cancel
            </button>
            <button
              onClick={submitAdd}
              className="rounded-md px-3 py-1.5 border border-white/10 bg-white/10 hover:bg-white/20"
            >
              Add
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- small form helpers ---------- */
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 inline-block">{label}</span>
      <input
        className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
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
    <label className="block text-sm">
      <span className="mb-1 inline-block">{label}</span>
      <select
        className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </label>
  );
}
