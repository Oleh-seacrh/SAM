"use client";

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/hooks/use-crm";
import { useSessions, SavedItem } from "@/hooks/use-sessions";
import { useSettings } from "@/hooks/use-settings";
import { usePrompts } from "@/hooks/use-prompts";
import { canonicalHomepage, getDomain } from "@/lib/domain";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string; };
// NEW: кнопка інференсу брендів та бейджі
import { FindClientButton } from "@/components/search/FindClientButton";
import { BrandBadge } from "@/components/search/BrandBadge";

type SearchItem = { title: string; link: string; displayLink: string; snippet?: string; homepage?: string };
type SearchResponse = {
  q: string; num: number; start: number; nextStart: number | null; prevStart: number | null;
  totalResults: number; items: SearchItem[];
  const [err, setErr] = useState<string | null>(null);

  const { add: addCRM, existsDomain } = useCRM();
  const { sessions, add: addSession } = useSessions();
  const { add: addSession } = useSessions();
  const { settings, setLastSearch, setLLM, setAutoRun } = useSettings();
  const { prompts, add: addPrompt, remove: removePrompt, lastUsedId, setLastUsedId } = usePrompts();

  // LLM UI
  const [provider, setProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [model, setModel] = useState<string>("");
  const [model, setModel] = useState<string>(""); // опційно, можна лишати порожнім
  const [prompt, setPrompt] = useState<string>(
    "Target: B2B distributors/manufacturers of X-ray film and related medical imaging consumables. Exclude blogs, news, generic marketplaces."
  );
  const [scoring, setScoring] = useState(false);
  const [scores, setScores] = useState<ScoresByDomain>({});

  // NEW: tags input for Add-to-CRM modal
  // NEW: результати інференсу брендів (url -> brands[])
  const [brandMatches, setBrandMatches] = useState<Record<string, string[]>>({});

  // NEW: tags input для Add-to-CRM модалки
  const [tagsText, setTagsText] = useState("");

  // restore last search + last LLM prompt/provider/model
  useEffect(() => {
    if (!settings?.autoRunLastSearch) return;
    if (settings?.lastQuery) {
      // auto-run last search once on load
      runSearch(settings.lastStart || 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoRunLastSearch]);

  // history chips
  const [history, setHistory] = useState<string[]>([]);
  useEffect(() => { if (data?.q) setHistory(p => (p[0] === data.q ? p : [data.q, ...p].slice(0,10))); }, [data?.q]);
  useEffect(() => {
    if (data?.q) setHistory((p) => (p[0] === data.q ? p : [data.q, ...p].slice(0, 10)));
  }, [data?.q]);

  async function runSearch(nextStart?: number) {
    const query = q.trim(); if (!query) return;
    setLoading(true); setErr(null);
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setErr(null);
    try {
      const s = nextStart ?? start;
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&num=${num}&start=${s}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Search failed");
      setData(j as SearchResponse);

      // скидаємо попередні оцінки й інференс брендів для нової видачі
      setScores({});
      setBrandMatches({});

      // persist last search
      setLastSearch(query, s, num);

      // save session snapshot
      const savedItems: SavedItem[] = (j.items ?? []).map((it: any) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
        return { title: it.title, link: it.link, displayLink: it.displayLink, snippet: it.snippet, homepage, domain: getDomain(homepage) };
        return {
          title: it.title,
          link: it.link,
          displayLink: it.displayLink,
          snippet: it.snippet,
          homepage,
          domain: getDomain(homepage),
        };
      });
      addSession({ q: j.q, num: j.num, start: j.start, totalResults: j.totalResults || 0, items: savedItems });

      if (nextStart !== undefined) setStart(nextStart);
    } catch(e:any){ setErr(e.message || "Search failed"); } finally { setLoading(false); }
    } catch (e: any) {
      setErr(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!data?.items?.length) return;
    setScoring(true); setErr(null);
    setScoring(true);
    setErr(null);
    try {
      const items = data.items.map((it) => {
        const homepage = canonicalHomepage(it.homepage ?? it.link);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Scoring failed");
      setScores(j.scores || {});
    } catch (e: any) { setErr(e.message || "Scoring failed"); } finally { setScoring(false); }
    } catch (e: any) {
      setErr(e.message || "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  const canPrev = useMemo(()=>!!data?.prevStart,[data?.prevStart]);
  const canNext = useMemo(()=>!!data?.nextStart,[data?.nextStart]);
  const canPrev = useMemo(() => !!data?.prevStart, [data?.prevStart]);
  const canNext = useMemo(() => !!data?.nextStart, [data?.nextStart]);

  // Add-to-CRM modal
  const [open, setOpen] = useState(false);
    const homepage = canonicalHomepage(it.homepage ?? it.link);
    const domain = getDomain(homepage);
    setDraft({
      companyName: it.title?.slice(0,80) || domain,
      domain, status: "New", source: "google",
      brand: "", product: "", quantity: "", dealValueUSD: undefined,
      country: "", industry: "", note: "",
      // NEW
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
      tags: []
      tags: [],
    });
    setTagsText("");
    setOpen(true);
  }
  function submitAdd() {
    if (!draft.companyName || !draft.domain ) return;
    if (!draft.companyName || !draft.domain) return;
    const dealValue = draft.dealValueUSD ? Number(draft.dealValueUSD) : undefined;
    const tags = tagsText.split(",").map((s)=>s.trim()).filter(Boolean);
    const tags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = { ...draft, dealValueUSD: dealValue, sizeTag: draft.sizeTag || undefined, tags };
    addCRM(payload);
    setOpen(false);

      {/* Search form + autorun toggle */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <form onSubmit={(e)=>{e.preventDefault(); setStart(1); runSearch(1);}}
              className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 outline-none"
                 placeholder="Enter keywords (e.g., x-ray film distributor India)"
                 value={q} onChange={e=>setQ(e.target.value)} />
          <button type="submit" disabled={loading || !q.trim()}
                  className="rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
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
            <input
              type="checkbox"
              checked={Boolean(settings?.autoRunLastSearch)}
              onChange={(e)=>setAutoRun(e.target.checked)}
              onChange={(e) => setAutoRun(e.target.checked)}
            />
            Auto-run last search on load
          </label>
          {settings?.lastQuery && (
            <span>Last: <b>{settings.lastQuery}</b></span>
            <span>
              Last: <b>{settings.lastQuery}</b>
            </span>
          )}
        </div>

        {history.length>0 && (
        {history.length > 0 && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            <div className="mb-1">Recent queries:</div>
            <div className="flex flex-wrap gap-2">
              {history.map(h=>(
                <button key={h} onClick={()=>{setQ(h); setStart(1); runSearch(1);}}
                        className="rounded-full border border-white/10 px-2.5 py-1 hover:bg-white/10">{h}</button>
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

      {/* AI panel + prompt library */}
      {/* AI panel + prompt library + Find client */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 inline-block">Provider</span>
            <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                    value={provider} onChange={(e)=>setProvider(e.target.value as any)}>
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
            <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                   placeholder="auto (e.g., gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)"
                   value={model} onChange={(e)=>setModel(e.target.value)} />
            <input
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="auto (e.g., gpt-4o-mini, claude-3-haiku, gemini-1.5-flash)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button onClick={analyze} disabled={!data?.items?.length || scoring}
              className="w-full rounded-lg px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-50">
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
          <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
                    value={prompt} onChange={(e)=>setPrompt(e.target.value)}
                    placeholder="Describe ideal prospect criteria…" />
          <textarea
            className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe ideal prospect criteria…"
          />
        </label>

        {/* Prompt library */}
            <select
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={lastUsedId ?? ""}
              onChange={e=>setLastUsedId(e.target.value || null)}
              onChange={(e) => setLastUsedId(e.target.value || null)}
            >
              <option value="">— Select —</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              onClick={()=>{
                const p = prompts.find(x => x.id === lastUsedId);
              onClick={() => {
                const p = prompts.find((x) => x.id === lastUsedId);
                if (!p) return;
                setProvider(p.provider);
                setModel(p.model || "");
            </button>
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={()=> lastUsedId && removePrompt(lastUsedId)}
              onClick={() => lastUsedId && removePrompt(lastUsedId)}
              disabled={!lastUsedId}
            >
              Delete
            <input
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              placeholder="Name to save current prompt…"
              value={newName} onChange={e=>setNewName(e.target.value)}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/10"
              onClick={()=>{
              onClick={() => {
                if (!newName.trim()) return;
                addPrompt({ name: newName.trim(), text: prompt, provider, model: model || undefined });
                setNewName("");
      {data && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--muted)]">Query: <b>{data.q}</b> • Total: {data.totalResults.toLocaleString()}</div>
            <div className="text-sm text-[var(--muted)]">
              Query: <b>{data.q}</b> • Total: {data.totalResults.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <button disabled={!canPrev || loading} onClick={()=>canPrev && runSearch(data.prevStart!)}
                      className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">← Previous</button>
              <button disabled={!canNext || loading} onClick={()=>canNext && runSearch(data.nextStart!)}
                      className="rounded-md px-3 py-1.5 border border-white/10 bg-white/5 disabled:opacity-40">Next →</button>
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
              const domain = getDomain(homepage);
              const score = scores[domain];
              const inCRM = existsDomain(domain);
              const brands = brandMatches[it.link] || []; // інференс повертає ключем саме вихідний URL

              return (
                <li key={it.link} className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                      </a>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        {it.displayLink} •{" "}
                        <a href={homepage} target="_blank" rel="noreferrer" className="hover:underline">{domain}</a>
                        <a href={homepage} target="_blank" rel="noreferrer" className="hover:underline">
                          {domain}
                        </a>
                      </div>
                    </div>

                      {inCRM ? (
                        <span className="text-xs rounded-md px-2 py-1 border border-emerald-500/40 bg-emerald-500/10">In CRM</span>
                      ) : (
                        <button onClick={()=>openAddModal(it)}
                                className="rounded-md text-sm px-3 py-1.5 border border-white/10 hover:bg-white/10">+ Add</button>
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
      )}

      {/* Add-to-CRM modal */}
      <Modal open={open} onClose={()=>setOpen(false)}>
      <Modal open={open} onClose={() => setOpen(false)}>
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
            <Field label="Company" value={draft.companyName || ""} onChange={(v) => setDraft((d: any) => ({ ...d, companyName: v }))} />
            <Field label="Country" value={draft.country || ""} onChange={(v) => setDraft((d: any) => ({ ...d, country: v }))} />
            <Field label="Industry" value={draft.industry || ""} onChange={(v) => setDraft((d: any) => ({ ...d, industry: v }))} />
            <Field label="Domain" value={draft.domain || ""} onChange={(v) => setDraft((d: any) => ({ ...d, domain: v }))} />
            <Select
              label="Status"
              value={draft.status || "New"}
              onChange={(v) => setDraft((d: any) => ({ ...d, status: v }))}
              options={["New", "Contacted", "Qualified", "Bad Fit"]}
            />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Opportunity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Brand" value={draft.brand||""} onChange={v=>setDraft((d:any)=>({...d, brand:v}))} />
            <Field label="Product" value={draft.product||""} onChange={v=>setDraft((d:any)=>({...d, product:v}))} />
            <Field label="Quantity" value={draft.quantity||""} onChange={v=>setDraft((d:any)=>({...d, quantity:v}))} />
            <Field label="Deal value (USD)" type="number" value={String(draft.dealValueUSD ?? "")}
                   onChange={v=>setDraft((d:any)=>({...d, dealValueUSD: v ? Number(v) : undefined}))} />
            <Field label="Brand" value={draft.brand || ""} onChange={(v) => setDraft((d: any) => ({ ...d, brand: v }))} />
            <Field label="Product" value={draft.product || ""} onChange={(v) => setDraft((d: any) => ({ ...d, product: v }))} />
            <Field label="Quantity" value={draft.quantity || ""} onChange={(v) => setDraft((d: any) => ({ ...d, quantity: v }))} />
            <Field
              label="Deal value (USD)"
              type="number"
              value={String(draft.dealValueUSD ?? "")}
              onChange={(v) => setDraft((d: any) => ({ ...d, dealValueUSD: v ? Number(v) : undefined }))}
            />
          </div>

          <div className="text-sm uppercase tracking-wide text-[var(--muted)]">Sizing & Tags</div>
              <select
                className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                value={draft.sizeTag || ""}
                onChange={(e)=>setDraft((d:any)=>({...d, sizeTag: e.target.value || ""}))}
                onChange={(e) => setDraft((d: any) => ({ ...d, sizeTag: e.target.value || "" }))}
              >
                <option value="">—</option>
                <option value="BIG">BIG</option>
                className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                placeholder="priority,repeat-buyer,EMEA"
                value={tagsText}
                onChange={(e)=>setTagsText(e.target.value)}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm mb-1">Note</label>
            <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
                      value={draft.note||""} onChange={e=>setDraft((d:any)=>({...d, note:e.target.value}))}/>
            <textarea
              className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-24"
              value={draft.note || ""}
              onChange={(e) => setDraft((d: any) => ({ ...d, note: e.target.value }))}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button onClick={()=>setOpen(false)} className="rounded-md px-3 py-1.5 border border-white/10">Cancel</button>
            <button onClick={submitAdd} className="rounded-md px-3 py-1.5 border border-white/10 bg-white/10 hover:bg-white/20">Add</button>
            <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 border border-white/10">
              Cancel
            </button>
            <button onClick={submitAdd} className="rounded-md px-3 py-1.5 border border-white/10 bg-white/10 hover:bg-white/20">
              Add
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, type="text" }:{
  label:string; value:string; onChange:(v:string)=>void; type?:string;
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
      <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
             value={value} onChange={e=>onChange(e.target.value)} type={type}/>
      <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)} type={type} />
    </label>
  );
}
function Select({ label, value, onChange, options }:{
  label:string; value:string; onChange:(v:string)=>void; options:string[];

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
      <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
              value={value} onChange={e=>onChange(e.target.value)}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
