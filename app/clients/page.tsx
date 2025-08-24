"use client";
import { useMemo, useRef, useState } from "react";
import { useCRM, CRMItem } from "@/hooks/use-crm";
import { useSessions } from "@/hooks/use-sessions";
import { usePrompts } from "@/hooks/use-prompts";
import { useSettings } from "@/hooks/use-settings";
import { Modal } from "@/components/ui/Modal";

export default function Page() {
  const { items, remove, update, byProduct, setItems } = useCRM();
  const { sessions, add, clear, /* expose setter via import */ } = useSessions(); // unchanged API in your file
  const { prompts, setAll: setPrompts } = usePrompts();
  const { settings, setSettings } = useSettings();

  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<CRMItem | null>(null);
  const [productFilter, setProductFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => byProduct(productFilter), [byProduct, productFilter]);

  const openView = (item: CRMItem) => { setCurrent(item); setOpen(true); };

  function exportJSON() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      crm: JSON.parse(localStorage.getItem("sam_crm_v3") || "[]"),
      prompts: JSON.parse(localStorage.getItem("sam_prompts_v1") || '{"items":[],"lastUsedId":null}'),
      sessions: JSON.parse(localStorage.getItem("sam_sessions_v1") || "[]"),
      settings: JSON.parse(localStorage.getItem("sam_settings_v1") || "{}"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sam-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file: File) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") return;
    // write to storages
    if (data.crm) localStorage.setItem("sam_crm_v3", JSON.stringify(data.crm));
    if (data.prompts) localStorage.setItem("sam_prompts_v1", JSON.stringify(data.prompts));
    if (data.sessions) localStorage.setItem("sam_sessions_v1", JSON.stringify(data.sessions));
    if (data.settings) localStorage.setItem("sam_settings_v1", JSON.stringify(data.settings));
    // refresh hooks state
    if (Array.isArray(data.crm)) setItems(data.crm);
    if (data.prompts?.items) setPrompts(data.prompts.items);
    // sessions hook in our simple version re-reads on reload; you can force a reload:
    location.reload();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Clients (CRM)</h1>

      {/* Backup & restore */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 flex flex-wrap gap-2 items-center">
        <button onClick={exportJSON} className="rounded-md px-3 py-1.5 border border-white/10 hover:bg-white/10">
          Export JSON (CRM + prompts + sessions + settings)
        </button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden"
               onChange={(e)=>{const f=e.target.files?.[0]; if(f) importJSON(f);}} />
        <button onClick={()=>fileRef.current?.click()} className="rounded-md px-3 py-1.5 border border-white/10 hover:bg-white/10">
          Import JSON
        </button>
        <div className="text-xs text-[var(--muted)] ml-auto">
          Data is stored locally (browser localStorage). Export before switching domains/browsers.
        </div>
      </div>

      {/* product filter */}
      <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10">
        <label className="text-sm block">
          <span className="mb-1 inline-block">Filter by product</span>
          <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                 placeholder="e.g., x-ray film"
                 value={productFilter} onChange={(e)=>setProductFilter(e.target.value)} />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 text-[var(--muted)]">
          No records yet. Add from <b>/searches</b>.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">Company</th>
                <th className="text-left px-3 py-2">Brand</th>
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-left px-3 py-2">Quantity</th>
                <th className="text-left px-3 py-2">Deal value (USD)</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">Domain</th>
                <th className="text-left px-3 py-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => (
                <tr key={it.id} className="border-t border-white/10">
                  <td className="px-3 py-2">{it.companyName}</td>
                  <td className="px-3 py-2">{it.brand ?? "-"}</td>
                  <td className="px-3 py-2">{it.product ?? "-"}</td>
                  <td className="px-3 py-2">{it.quantity ?? "-"}</td>
                  <td className="px-3 py-2">{typeof it.dealValueUSD === "number" ? it.dealValueUSD.toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">{it.status}</td>
                  <td className="px-3 py-2">{it.country ?? "-"}</td>
                  <td className="px-3 py-2">
                    <a href={it.url} target="_blank" rel="noreferrer" className="hover:underline">{it.domain}</a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10"
                              onClick={()=>{ setCurrent(it); setOpen(true); }}>Open</button>
                      <button className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10"
                              onClick={()=>remove(it.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal (залишай твій з попереднього кроку) */}
      <Modal open={open && !!current} onClose={()=>setOpen(false)}>
        {current && (
          <DetailCard item={current} onChange={(patch)=>update(current.id, patch)} />
        )}
      </Modal>
    </div>
  );
}

/* нижче – твій DetailCard/Inp/Row з попередньої версії (можеш залишити без змін) */
function Row({ label, children }: {label:string; children:any}) {
  return (<label className="grid grid-cols-3 gap-3 items-center"><span className="text-sm text-[var(--muted)]">{label}</span><div className="col-span-2">{children}</div></label>);
}
function Inp({ value, onChange, type="text" }:{ value:any; onChange:(v:any)=>void; type?:string}) {
  return (<input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2" value={value ?? ""} onChange={e=>onChange(type==="number" ? Number(e.target.value||0) : e.target.value)} type={type}/>);
}
function DetailCard({ item, onChange }: { item: CRMItem; onChange: (patch: Partial<CRMItem>) => void }) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{item.companyName}</h3>
      <div className="text-sm uppercase tracking-wide text-[var(--muted)] mb-2">Company</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Row label="Company"><Inp value={item.companyName} onChange={v=>onChange({companyName:v})} /></Row>
        <Row label="Country"><Inp value={item.country} onChange={v=>onChange({country:v})} /></Row>
        <Row label="Industry"><Inp value={item.industry} onChange={v=>onChange({industry:v})} /></Row>
        <Row label="Domain"><Inp value={item.domain} onChange={v=>onChange({domain:v})} /></Row>
        <Row label="Homepage URL"><Inp value={item.url} onChange={v=>onChange({url:v})} /></Row>
        <Row label="Status">
          <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  value={item.status} onChange={e=>onChange({status: e.target.value as any})}>
            {["New","Contacted","Qualified","Bad Fit"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Row>
      </div>
      <div className="text-sm uppercase tracking-wide text-[var(--muted)] mb-2">Opportunity</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Row label="Brand"><Inp value={item.brand} onChange={v=>onChange({brand:v})} /></Row>
        <Row label="Product"><Inp value={item.product} onChange={v=>onChange({product:v})} /></Row>
        <Row label="Quantity"><Inp value={item.quantity} onChange={v=>onChange({quantity:v})} /></Row>
        <Row label="Deal value (USD)"><Inp type="number" value={item.dealValueUSD} onChange={v=>onChange({dealValueUSD:v})} /></Row>
      </div>
      <div className="text-sm uppercase tracking-wide text-[var(--muted)] mb-2">Notes</div>
      <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
                value={item.note ?? ""} onChange={e=>onChange({note:e.target.value})}/>
      <div className="mt-4 text-xs text-[var(--muted)]">
        Added: {new Date(item.addedAt).toLocaleString()} • Updated: {new Date(item.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
