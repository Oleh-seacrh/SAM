"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/hooks/use-crm";
import { useSessions, SavedItem } from "@/hooks/use-sessions";
import { useSettings } from "@/hooks/use-settings";
import { usePrompts } from "@/hooks/use-prompts";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

/* ---------- Types ---------- */
type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string; };
type SearchResponse = {
  q: string; num: number; start: number; nextStart: number | null; prevStart: number | null;
  totalResults: number; items: SearchItem[];
};

// ⬇️ Розширили Score: підтримуємо додаткові атрибути, якщо бек їх дасть.
// Якщо бек не дає — заповнимо евристиками на клієнті (fallback).
type Score = {
  label: "good" | "maybe" | "bad";
  confidence?: number;
  reasons?: string[];
  tags?: string[];
  companyType?: "manufacturer" | "distributor" | "dealer" | "other";
  country?: string;       // ISO-2 або назва
  countryEmoji?: string;  // 🇺🇦
};
type ScoresByDomain = Record<string, Score>;

/* ---------- Small helpers: country & company type heuristics ---------- */

// дуже легкий маппінг ccTLD -> ISO2 (і емодзі)
const TLD2ISO: Record<string, string> = {
  "uk": "GB", "gb": "GB", "us": "US", "ua": "UA", "de": "DE", "fr": "FR", "it": "IT",
  "es": "ES", "pt": "PT", "pl": "PL", "ro": "RO", "nl": "NL", "be": "BE", "se": "SE",
  "no": "NO", "dk": "DK", "fi": "FI", "cz": "CZ", "sk": "SK", "hu": "HU", "at": "AT",
  "ch": "CH", "tr": "TR", "gr": "GR", "bg": "BG", "hr": "HR", "rs": "RS", "si": "SI",
  "lt": "LT", "lv": "LV", "ee": "EE", "ie": "IE", "is": "IS", "ca": "CA", "mx": "MX",
  "br": "BR", "ar": "AR", "cl": "CL", "co": "CO", "pe": "PE", "au": "AU", "nz": "NZ",
  "za": "ZA", "ae": "AE", "sa": "SA", "in": "IN", "pk": "PK", "bd": "BD", "vn": "VN",
  "th": "TH", "my": "MY", "sg": "SG", "id": "ID", "ph": "PH", "jp": "JP", "kr": "KR",
  "cn": "CN", "hk": "HK", "tw": "TW"
};
function isoToEmoji(iso?: string | null): string | undefined {
  if (!iso || iso.length !== 2) return;
  const a = iso[0].toUpperCase().charCodeAt(0) - 65 + 0x1f1e6;
  const b = iso[1].toUpperCase().charCodeAt(0) - 65 + 0x1f1e6;
  return String.fromCodePoint(a) + String.fromCodePoint(b);
}
function guessCountryFromDomain(domain: string): { country?: string; countryEmoji?: string } {
  // беремо праву частину TLD: foo.co.uk → uk; foo.de → de; foo.com → пусто
  const parts = domain.split(".");
  if (parts.length < 2) return {};
  let tld = parts[parts.length - 1].toLowerCase();
  // .co.uk/.com.au → беремо останнє
  if (tld.length < 2 && parts.length >= 3) tld = parts[parts.length - 2].toLowerCase();

  const iso = TLD2ISO[tld];
  if (!iso) return {};
  return { country: iso, countryEmoji: isoToEmoji(iso) };
}

// дуже проста евристика типу компанії (тітри/сніпет)
function guessCompanyType(text: string): Score["companyType"] {
  const s = text.toLowerCase();
  if (/\bmanufacturer|factory|producer|oem\b/.test(s)) return "manufacturer";
  if (/\bdistributor|wholesaler|wholesale\b/.test(s)) return "distributor";
  if (/\bdealer|reseller|retailer|stockist\b/.test(s)) return "dealer";
  return "other";
}

/* ---------- Page ---------- */
export default function Page() {
  const [q, setQ] = useState("");
  const [start, setStart] = useState(1);
  const [num] = useState(10);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { add: addCRM, existsDomain } = useCRM();
  const { sessions, add: addSession } = useSessions();
  const { settings, setLastSearch, setLLM, setAutoRun } = useSettings();
  const { prompts, add: addPrompt, remove: removePrompt, lastUsedId, setLastUsedId } = usePrompts();

  // LLM UI
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState<string>(
    "Target: B2B distributors/manufacturers of X-ray film and related medical imaging consumables. Exclude blogs, news, generic marketplaces. Include: company type (manufacturer/distributor/dealer/other) and country (ISO-2 if possible)."
  );
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoresByDomain>({});

  // NEW: tags input for Add-to-CRM modal
  const [tagsText, setTagsText] = useState("");

  // restore last search + last LLM prompt/provider/model
  useEffect(() => {
    if (!settings) return;
    if (settings.lastQuery) setQ(settings.lastQuery);
    if (settings.lastStart) setStart(settings.lastStart);
    if (settings.lastProvider) setProvider(settings.lastProvider);
    if (settings.lastModel) setModel(settings.lastModel);
    if (settings.lastPrompt) setPrompt(settings.lastPrompt);
  }, [settings]);

  // optional autorun
  useEffect(() => {
    if (!settings?.autoRunLastSearch) return;
    if (settings?.lastQuery) {
      runSearch(settings.lastStart || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoRunLastSearch]);

  // history chips
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => { if (data?.q) setHistory(p => (p[0] === data.q ? p : [data.q, ...p].slice(0,10))); }, [data?.q]);

  async function runSearch(nextStart?: number) {
    const query = q.trim(); if (!query) return;
    setLoading(true); setErr(null);
    try {
      const s = nextStart ?? start;
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&num=${num}&start=${s}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Search failed");
      setData(j as SearchResponse);
      setScores({});
      // persist last search
      setLastSearch(query, s, num);

      // save session snapshot
      const savedItems: SavedItem[] = (j.items ?? []).map((it: any) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return { title: it.title, link: it.link, displayLink: it.displayLink, snippet: it.snippet, homepage, domain: getDomain(homepage) };
      });
      addSession({ q: j.q, num: j.num, start: j.start, totalResults: j.totalResults || 0, items: savedItems });

      if (nextStart !== undefined) setStart(nextStart);
    } catch(e:any){ setErr(e.message || "Search failed"); } finally { setLoading(false); }
  }

  async function analyze() {
    if (!data?.items?.length) return;
    setScoring(true); setErr(null);
    try {
      const items = data.items.map((it) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return { title: it.title, snippet: it.snippet, homepage, domain: getDomain(homepage) };
      });
      // remember last LLM settings
      setLLM(provider, model || undefined, prompt);

      const r = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model: model || undefined, prompt, items }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Scoring failed");

      // очікуємо j.scores: ScoresByDomain; якщо бек не повернув companyType/country — додамо евристики
      const next: ScoresByDomain = { ...(j.scores || {}) };

      for (const it of items) {
        const d = it.domain;
        const current = next[d] || { label: "maybe" as const };
        // country fallback
        if (!current.country || !current.countryEmoji) {
          const { country, countryEmoji } = guessCountryFromDomain(d);
          if (country && !current.country) current.country = country;
          if (countryEmoji && !current.countryEmoji) current.countryEmoji = countryEmoji;
        }
        // company type fallback
        if (!current.companyType) {
          current.companyType = guessCompanyType(`${it.title || ""} ${it.snippet || ""}`);
        }
        next[d] = current;
      }

      setScores(next);
    } catch (e: any) { setErr(e.message || "Scoring failed"); } finally { setScoring(false); }
  }

  const canPrev = useMemo(()=>!!data?.prevStart,[data?.prevStart]);
  const canNext = useMemo(()=>!!data?.nextStart,[data?.nextStart]);

  // Add-to-CRM modal
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({});
  function openAddModal(it: SearchItem) {
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft({
      companyName: it.title?.slice(0,80) || domain,
      domain, status: "New", source: "google",
      brand: "", product: "", quantity: "", dealValueUSD: undefined,
      country: "", industry: "", note: "",
      sizeTag: "",
      tags: []
    });
    setTagsText("");
    setOpen(true);
  }
  function submitAdd() {
    if (!draft.companyName || !draft.domain ) return;
    const dealValue = draft.dealValueUSD ? Number(draft.dealValueUSD) : undefined;
    const tags = tagsText.split(",").map((s)=>s.trim()).filter(Boolean);
    const payload = { ...draft, dealValueUSD: dealValue, sizeTag: draft.sizeTag || undefined, tags };
    addCRM(payload);
    setOpen(false);
  }

  // prompt library UI state
  const [newName, setNewName] = useState("");

  /* ---------- Render ---------- */
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Searches</h1>

      {/* Search form + autorun toggle */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <form onSubmit={(e)=>{e.preventDefault(); setStart(1); runSearch(1);}}
              className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 outline-none"
                 placeholder="Enter keywords (e.g., x-ray film distributor India)"
                 value={q} onChange={e=>setQ(e.target.value)} />
          <button type="submit" disabled={loading || !q.trim()}
                  className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="mt-2 text-xs text-[var(--muted)] flex items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(settings?.autoRunLastSearch)}
              onChange={(e)=>setAutoRun(e.target.checked)}
            />
            Auto-run last search on load
          </label>
          {settings?.lastQuery && (
            <span>Last: <b>{settings.lastQuery}</b></span>
          )}
        </div>
      </div>

      {/* AI panel + prompt library */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Provider</span>
            <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                    value={provider} onChange={(e)=>setProvider(e.target.value as any)}>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 inline-block">Model (optional)</span>
            <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                   placeholder="auto (e.g., gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)"
                   value={model} onChange={(e)=>setModel(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button onClick={analyze} disabled={!data?.items?.length || scoring}
              className="w-full rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
              {scoring ? "Analyzing…" : "Analyze current results"}
            </button>
          </div>
        </div>

        <label className="text-sm block">
          <span className="mb-1 inline-block">Prompt</span>
          <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
                    value={prompt} onChange={(e)=>setPrompt(e.target.value)}
                    placeholder="Describe ideal prospect criteria…" />
        </label>

        {/* Prompt library */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Saved prompts</span>
            <select
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={lastUsedId ?? ""}
              onChange={e=>setLastUsedId(e.target.value || null)}
            >
              <option value="">— Select —</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={()=>{
                const p = prompts.find(x => x.id === lastUsedId);
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
              onClick={()=> lastUsedId && removePrompt(lastUsedId)}
              disabled={!lastUsedId}
            >
              Delete
            </button>
          </div>
          <div className="flex items-end gap-2">
            <input
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="Name to save current prompt…"
              value={newName} onChange={e=>setNewName(e.target.value)}
            />
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={()=>{
                if (!newName.trim()) return;
                addPrompt({ name: newName.trim(), text: prompt, provider, model: model || undefined });
                setNewName("");
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {err && <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm">{err}</div>}

      {/* Results */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">Query: <b>{data.q}</b> • Total: {data.totalResults.toLocaleString()}</div>
            <Pager
              canPrev={!!data.prevStart}
              canNext={!!data.nextStart}
              loading={loading}
              onPrev={()=>data.prevStart && runSearch(data.prevStart)}
              onNext={()=>data.nextStart && runSearch(data.nextStart)}
            />
          </div>

          <ul className="space-y-3">
            {data.items.map((it) => {
              const homepage = canonicalHomepage(it.homepage ?? it.link);
              const domain = getDomain(homepage);
              const score = scores[domain];
              const inCRM = existsDomain(domain);

              // фолбек атрибутів (якщо бек їх не дав)
              let companyType = score?.companyType;
              let country = score?.country;
              let countryEmoji = score?.countryEmoji;

              if (!companyType) {
                companyType = guessCompanyType(`${it.title || ""} ${it.snippet || ""}`);
              }
              if (!country || !countryEmoji) {
                const g = guessCountryFromDomain(domain);
                country = country || g.country;
                countryEmoji = countryEmoji || g.countryEmoji;
              }

              return (
                <li key={it.link} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <a href={it.link} target="_blank" rel="noreferrer" className="text-lg font-medium hover:underline">
                        {it.title}
                      </a>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {it.displayLink} •{" "}
                        <a href={homepage} target="_blank" rel="noreferrer" className="hover:underline">{domain}</a>
                      </div>

                      {/* meta row: company type + country */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {/* Company Type */}
                        <TypeBadge type={companyType} />

                        {/* Country */}
                        {(country || countryEmoji) && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5">
                            {countryEmoji && <span>{countryEmoji}</span>}
                            {country && <span className="opacity-80">{country}</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {score && <Badge tone={score.label}>{score.label.toUpperCase()}</Badge>}
                      {inCRM ? (
                        <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">In CRM</span>
                      ) : (
                        <button onClick={()=>openAddModal(it)}
                                className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10">+ Add</button>
                      )}
                    </div>
                  </div>

                  {it.snippet && <p className="mt-2 text-sm text-[var(--muted)]">{it.snippet}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Add-to-CRM modal */}
      <Modal open={open} onClose={()=>setOpen(false)}>
        <h3 className="text-lg font-semibold mb-3">Add to CRM</h3>

        <div className="space-y-4">
          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Company</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company" value={draft.companyName||""} onChange={v=>setDraft((d:any)=>({...d, companyName:v}))} />
            <Field label="Country" value={draft.country||""} onChange={v=>setDraft((d:any)=>({...d, country:v}))} />
            <Field label="Industry" value={draft.industry||""} onChange={v=>setDraft((d:any)=>({...d, industry:v}))} />
            <Field label="Domain" value={draft.domain||""} onChange={v=>setDraft((d:any)=>({...d, domain:v}))} />
            <Select label="Status" value={draft.status || "New"} onChange={v=>setDraft((d:any)=>({...d, status:v}))}
                    options={["New","Contacted","Qualified","Bad Fit"]} />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Opportunity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Brand" value={draft.brand||""} onChange={v=>setDraft((d:any)=>({...d, brand:v}))} />
            <Field label="Product" value={draft.product||""} onChange={v=>setDraft((d:any)=>({...d, product:v}))} />
            <Field label="Quantity" value={draft.quantity||""} onChange={v=>setDraft((d:any)=>({...d, quantity:v}))} />
            <Field label="Deal value (USD)" type="number" value={String(draft.dealValueUSD ?? "")}
                   onChange={v=>setDraft((d:any)=>({...d, dealValueUSD: v ? Number(v) : undefined}))} />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Sizing & Tags</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 inline-block">Size</span>
              <select
                className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                value={draft.sizeTag || ""}
                onChange={(e)=>setDraft((d:any)=>({...d, sizeTag: e.target.value || ""}))}
              >
                <option value="">—</option>
                <option value="BIG">BIG</option>
                <option value="SMALL">SMALL</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 inline-block">Tags (comma-separated)</span>
              <input
                className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                placeholder="priority,repeat-buyer,EMEA"
                value={tagsText}
                onChange={(e)=>setTagsText(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm mb-1">Note</label>
            <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
                      value={draft.note||""} onChange={e=>setDraft((d:any)=>({...d, note:e.target.value}))}/>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button onClick={()=>setOpen(false)} className="rounded-md px-3 py-1.5 border border-white/10">Cancel</button>
            <button onClick={submitAdd} className="rounded-md px-3 py-1.5 border border-white/10 bg-white/10 hover:bg-white/20">Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Small UI bits ---------- */
function Pager({ canPrev, canNext, loading, onPrev, onNext }:{
  canPrev:boolean; canNext:boolean; loading:boolean; onPrev:()=>void; onNext:()=>void;
}) {
  return (
    <div className="flex gap-2">
      <button disabled={!canPrev || loading} onClick={onPrev}
              className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">← Previous</button>
      <button disabled={!canNext || loading} onClick={onNext}
              className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">Next →</button>
    </div>
  );
}

function Field({ label, value, onChange, type="text" }:{
  label:string; value:string; onChange:(v:string)=>void; type?:string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 inline-block">{label}</span>
      <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
             value={value} onChange={e=>onChange(e.target.value)} type={type}/>
    </label>
  );
}
function Select({ label, value, onChange, options }:{
  label:string; value:string; onChange:(v:string)=>void; options:string[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 inline-block">{label}</span>
      <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={value} onChange={e=>onChange(e.target.value)}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function TypeBadge({ type }: { type?: Score["companyType"] }) {
  const t = type || "other";
  const tone =
    t === "manufacturer" ? "emerald" :
    t === "distributor"  ? "sky" :
    t === "dealer"       ? "amber" : "zinc";
  const label = t[0].toUpperCase() + t.slice(1);
  // якщо у тебе Badge не підтримує кастомні тони — просто класами
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs border ${
      tone === "emerald" ? "border-emerald-500/40 bg-emerald-500/10" :
      tone === "sky"     ? "border-sky-500/40 bg-sky-500/10" :
      tone === "amber"   ? "border-amber-500/40 bg-amber-500/10" :
                           "border-white/10 bg-white/5"
    }`}>
      {label}
    </span>
  );
}
