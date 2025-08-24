"use client";
import { useState } from "react";
import { useCRM, CRMItem } from "@/hooks/use-crm";
import { Modal } from "@/components/ui/Modal";

export default function Page() {
  const { items, remove, update } = useCRM();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<CRMItem | null>(null);

  const openView = (item: CRMItem) => { setCurrent(item); setOpen(true); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Clients (CRM)</h1>

      {items.length === 0 ? (
        <div className="rounded-xl bg-[var(--card)] p-4 border border-white/10 text-[var(--muted)]">
          Поки порожньо. Додай зі сторінки <b>/searches</b>.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-3 py-2">Company</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Domain</th>
                <th className="text-left px-3 py-2 w-32">Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-t border-white/10">
                  <td className="px-3 py-2">{it.companyName}</td>
                  <td className="px-3 py-2">{it.country || "-"}</td>
                  <td className="px-3 py-2">{it.status}</td>
                  <td className="px-3 py-2">
                    <a href={it.url} target="_blank" rel="noreferrer" className="hover:underline">{it.domain}</a>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10"
                              onClick={()=>openView(it)}>Відкрити</button>
                      <button className="rounded-md px-2 py-1 border border-white/10 hover:bg-white/10"
                              onClick={()=>remove(it.id)}>Видалити</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Детальна картка + редагування */}
      <Modal open={open && !!current} onClose={()=>setOpen(false)}>
        {current && (
          <DetailCard item={current} onChange={(patch)=>update(current.id, patch)} />
        )}
      </Modal>
    </div>
  );
}

function Row({ label, children }: {label:string; children:any}) {
  return (
    <label className="grid grid-cols-3 gap-3 items-center">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <div className="col-span-2">{children}</div>
    </label>
  );
}

function Inp({ value, onChange, type="text" }:{ value:any; onChange:(v:any)=>void; type?:string}) {
  return (
    <input className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
           value={value ?? ""} onChange={e=>onChange(type==="number" ? Number(e.target.value||0) : e.target.value)} type={type}/>
  );
}

function DetailCard({ item, onChange }: { item: CRMItem; onChange: (patch: Partial<CRMItem>) => void }) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{item.companyName}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Row label="Company"><Inp value={item.companyName} onChange={v=>onChange({companyName:v})} /></Row>
        <Row label="Country"><Inp value={item.country} onChange={v=>onChange({country:v})} /></Row>
        <Row label="Industry"><Inp value={item.industry} onChange={v=>onChange({industry:v})} /></Row>
        <Row label="Employees"><Inp type="number" value={item.employees} onChange={v=>onChange({employees:v})} /></Row>
        <Row label="Annual Revenue USD"><Inp type="number" value={item.annualRevenueUSD} onChange={v=>onChange({annualRevenueUSD:v})} /></Row>
        <Row label="Domain"><Inp value={item.domain} onChange={v=>onChange({domain:v})} /></Row>
        <Row label="Homepage URL"><Inp value={item.url} onChange={v=>onChange({url:v})} /></Row>
        <Row label="Status">
          <select className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2"
                  value={item.status} onChange={e=>onChange({status: e.target.value as any})}>
            {["New","Contacted","Qualified","Bad Fit"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Row>

        <Row label="Contact name"><Inp value={item.contactName} onChange={v=>onChange({contactName:v})} /></Row>
        <Row label="Contact role"><Inp value={item.contactRole} onChange={v=>onChange({contactRole:v})} /></Row>
        <Row label="Contact email"><Inp value={item.contactEmail} onChange={v=>onChange({contactEmail:v})} /></Row>
        <Row label="Contact phone"><Inp value={item.contactPhone} onChange={v=>onChange({contactPhone:v})} /></Row>

        <label className="sm:col-span-2">
          <div className="text-sm text-[var(--muted)] mb-1">Note</div>
          <textarea className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-2 h-28"
                    value={item.note ?? ""} onChange={e=>onChange({note:e.target.value})}/>
        </label>
      </div>
      <div className="mt-4 text-xs text-[var(--muted)]">
        Added: {new Date(item.addedAt).toLocaleString()} • Updated: {new Date(item.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
