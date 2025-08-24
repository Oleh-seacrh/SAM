"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/hooks/use-crm";
import { useSessions, SavedItem } from "@/hooks/use-sessions";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string; };
type SearchResponse = {
  q: string; num: number; start: number; nextStart: number | null; prevStart: number | null;
  totalResults: number; items: SearchItem[];
};

type Score = { label: "good" | "maybe" | "bad"; confidence?: number; reasons?: string[]; tags?: string[] };
type ScoresByDomain = Record<string, Score>;

export default function Page() {
  const [q, setQ] = useState("");
  const [start, setStart] = useState(1);
  const [num] = useState(10);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { add: addCRM, existsDomain } = useCRM();
  const { sessions, add: addSession, remove: removeSession, clear: clearSessions } = useSessions();

  // LLM UI state
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("Target: B2B distributors / manufacturers of X-ray film. Exclude blogs, news, generic marketplaces.");
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoresByDomain>({});

  // history для швидких кнопок
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
      setScores({}); // скидати минулі оцінки при новому пошуку

      // автосесія
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

  const canPrev = useMemo(()=>!!data?.prevStart,[data?.prevStart]);
  const canNext = useMemo(()=>!!data?.nextStart,[data?.nextStart]);

  // модал додавання в CRM (скорочена версія)
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({});
  function openAddModal(it: SearchItem) {
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft({ companyName: it.title?.slice(0,80) || domain, domain, url: homepage, status: "New", source: "google" });
    setOpen(true);
  }
  function submitAdd() {
    if (!draft.companyName || !draft.domain || !draft.url) return;
    addCRM({ ...draft });
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Searches</h1>

      {/* форма пошуку */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <form onSubmit={(e)=>{e.preventDefault(); setStart(1); runSearch(1);}}
              className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 outline-none"
                 placeholder="Ключові слова (наприклад: x-ray film distributor India)"
                 value={q} onChange={e=>setQ(e.target.value)} />
          <button type="submit" disabled={loading || !q.trim()}
                  className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
            {loading ? "Пошук…" : "Шукати"}
          </button>
        </form>

        {history.length>0 && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            <div className="mb-1">Останні запити:</div>
            <div className="flex flex-wrap gap-2">
              {history.map(h=>(
                <button key={h} onClick={()=>{setQ(h); setStart(1); runSearch(1);}}
                        className="rounded-full border border-white/10 px-2.5 py-1 hover:bg-white/10">{h}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* панель AI */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
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
                   placeholder="auto (e.g. gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)"
                   value={model} onChange={(e)=>setModel(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button
              onClick={analyze}
              disabled={!data?.items?.length || scoring}
              className="w-full rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50"
            >
              {scoring ? "Аналізую…" : "Аналізувати поточні результати"}
            </button>
          </div>
        </div>
        <label className="text-sm block mt-3">
          <span className="mb-1 inline-block">Prompt</span>
          <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
                    value={prompt} onChange={(e)=>setPrompt(e.target.value)}
                    placeholder="Опиши критерії ідеального клієнта…" />
        </label>
      </div>

      {err && <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm">{err}</div>}

      {/* результати пошуку + теги */}
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">Запит: <b>{data.q}</b> • Всього: {data.totalResults.toLocaleString()}</div>
            <div className="flex gap-2">
              <button disabled={!canPrev || loading} onClick={()=>canPrev && runSearch(data.prevStart!)}
                      className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">← Попередня</button>
              <button disabled={!canNext || loading} onClick={()=>canNext && runSearch(data.nextStart!)}
                      className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">Наступна →</button>
            </div>
          </div>

          <ul className="space-y-3">
            {data.items.map((it) => {
              const homepage = canonicalHomepage(it.homepage ?? it.link);
              const domain = getDomain(homepage);
              const score = scores[domain];
              const inCRM = existsDomain(domain);
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
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {score && <Badge tone={score.label}>{score.label.toUpperCase()}</Badge>}
                      {inCRM ? (
                        <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">В CRM</span>
                      ) : (
                        <button onClick={()=>openAddModal(it)}
                                className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10">+ Додати</button>
                      )}
                    </div>
                  </div>
                  {it.snippet && <p className="mt-2 text-sm text-[var(--muted)]">{it.snippet}</p>}
                  {score?.reasons && score.reasons.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Причини: {score.reasons.join("; ")}
                    </div>
                  )}
                  {score?.tags && score.tags.length > 0 && (
                    <div className="mt-1 text-xs opacity-80">
                      Теги: {score.tags.map((t,i)=><span key={i} className="mr-1">#{t}</span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* модал додавання в CRM */}
      <Modal open={open} onClose={()=>setOpen(false)}>
        <h3 className="text-lg font-semibold mb-3">Додати в CRM</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company" value={draft.companyName||""} onChange={v=>setDraft((d:any)=>({...d, companyName:v}))} />
          <Field label="Homepage (URL)" value={draft.url||""} onChange={v=>setDraft((d:any)=>({...d, url:v}))} />
          <Field label="Domain" value={draft.domain||""} onChange={v=>setDraft((d:any)=>({...d, domain:v}))} />
          <Select label="Status" value={draft.status || "New"} onChange={v=>setDraft((d:any)=>({...d, status:v}))}
                  options={["New","Contacted","Qualified","Bad Fit"]} />
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Note</label>
            <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
                      value={draft.note||""} onChange={e=>setDraft((d:any)=>({...d, note:e.target.value}))}/>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={()=>setOpen(false)} className="rounded-md px-3 py-1.5 border border-white/10">Скасувати</button>
          <button onClick={submitAdd} className="rounded-md px-3 py-1.5 border border-white/10 bg-white/10 hover:bg-white/20">Додати</button>
        </div>
      </Modal>
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
