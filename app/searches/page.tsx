"use client";
import { useEffect, useMemo, useState } from "react";
import { useCRM, CRMItem } from "@/hooks/use-crm";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string; };
type SearchResponse = {
  q: string; num: number; start: number; nextStart: number | null; prevStart: number | null;
  totalResults: number; items: SearchItem[];
};

export default function Page() {
  const [q, setQ] = useState("");
  const [start, setStart] = useState(1);
  const [num] = useState(10);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { add, existsDomain } = useCRM();

  // mini history
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
      if (nextStart !== undefined) setStart(nextStart);
    } catch(e:any){ setErr(e.message || "Search failed"); } finally { setLoading(false); }
  }
  const canPrev = useMemo(()=>!!data?.prevStart,[data?.prevStart]);
  const canNext = useMemo(()=>!!data?.nextStart,[data?.nextStart]);

  // modal state
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CRMItem>>({});

  function openAddModal(it: SearchItem) {
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft({
      companyName: it.title?.slice(0, 80) || domain,
      domain, url: homepage, country: "", industry: "", status: "New", source: "google"
    } as Partial<CRMItem>);
    setOpen(true);
  }
  function submitAdd() {
    if (!draft?.companyName || !draft?.domain || !draft?.url) return;
    add({
      companyName: draft.companyName!,
      domain: draft.domain!,
      url: draft.url!,
      country: draft.country?.trim() || undefined,
      industry: draft.industry?.trim() || undefined,
      employees: draft.employees ? Number(draft.employees) : undefined,
      annualRevenueUSD: draft.annualRevenueUSD ? Number(draft.annualRevenueUSD) : undefined,
      contactName: draft.contactName?.trim() || undefined,
      contactRole: draft.contactRole?.trim() || undefined,
      contactEmail: draft.contactEmail?.trim() || undefined,
      contactPhone: draft.contactPhone?.trim() || undefined,
      status: (draft.status as any) || "New",
      tags: draft.tags ?? [],
      note: draft.note?.trim() || undefined,
      source: "google"
    });
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Searches</h1>

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

      {err && <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm">{err}</div>}

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
              const inCRM = existsDomain(domain);
              return (
                <li key={it.link} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <a href={it.link} target="_blank" rel="noreferrer" className="text-lg font-medium hover:underline">{it.title}</a>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {it.displayLink} • <a href={homepage} target="_blank" rel="noreferrer" className="hover:underline">{domain}</a>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {inCRM ? (
                        <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">В CRM</span>
                      ) : (
                        <button onClick={()=>openAddModal(it)}
                                className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10">+ Додати</button>
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

      {/* Modal add/edit (мінімальна форма) */}
      <Modal open={open} onClose={()=>setOpen(false)}>
        <h3 className="text-lg font-semibold mb-3">Додати в CRM</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Company" value={draft.companyName||""} onChange={v=>setDraft(d=>({...d, companyName:v}))} />
          <Field label="Country" value={draft.country||""} onChange={v=>setDraft(d=>({...d, country:v}))} />
          <Field label="Industry" value={draft.industry||""} onChange={v=>setDraft(d=>({...d, industry:v}))} />
          <Field label="Employees" type="number" value={String(draft.employees ?? "")} onChange={v=>setDraft(d=>({...d, employees: v?Number(v):undefined}))} />
          <Field label="Annual Revenue (USD)" type="number" value={String(draft.annualRevenueUSD ?? "")} onChange={v=>setDraft(d=>({...d, annualRevenueUSD: v?Number(v):undefined}))} />
          <Field label="Homepage (URL)" value={draft.url||""} onChange={v=>setDraft(d=>({...d, url:v, domain: ""}))} />
          <Field label="Domain" value={draft.domain||""} onChange={v=>setDraft(d=>({...d, domain:v}))} />
          <Select label="Status" value={(draft.status as any) || "New"} onChange={v=>setDraft(d=>({...d, status: v as any}))}
                  options={["New","Contacted","Qualified","Bad Fit"]} />
          <Field label="Contact name" value={draft.contactName||""} onChange={v=>setDraft(d=>({...d, contactName:v}))} />
          <Field label="Contact role" value={draft.contactRole||""} onChange={v=>setDraft(d=>({...d, contactRole:v}))} />
          <Field label="Contact email" value={draft.contactEmail||""} onChange={v=>setDraft(d=>({...d, contactEmail:v}))} />
          <Field label="Contact phone" value={draft.contactPhone||""} onChange={v=>setDraft(d=>({...d, contactPhone:v}))} />
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Note</label>
            <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
                      value={draft.note||""} onChange={e=>setDraft(d=>({...d, note:e.target.value}))}/>
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

// маленькі інпути
function Field({ label, value, onChange, type="text" }:{
  label:string; value:string; onChange:(v:string)=>void; type?:string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 inline-block">{label}</span>
      <input
        className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
        value={value} onChange={e=>onChange(e.target.value)} type={type}
      />
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
