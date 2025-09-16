"use client";
import { useState, useCallback } from "react";
import { useSelfProfile } from "@/hooks/use-self";

type ParsedInquiry = {
  who: { name?: string|null; email?: string|null; phone?: string|null; source: "email"|"whatsapp"|"other" };
  company: { legalName?: string|null; displayName?: string|null; domain?: string|null; country?: string|null };
  intent: { type: "RFQ"|"Buy"|"Info"|"Support"; brand?: string|null; product?: string|null; quantity?: string|null; freeText?: string|null };
  meta: { confidence: number; rawText: string; imageUrl?: string|null };
};
type DedupCandidate = { id: string; name: string; domain?: string|null; match_type: string };
type IntakePreview = { normalized: ParsedInquiry; dedupe: { candidates: DedupCandidate[] } };

export default function CollectPage() {
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { self, setSelf, reset } = useSelfProfile();

  const onDrop = useCallback(async (file: File) => {
    setLoading(true); setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    // ← важливо: прокидуємо профіль у промпт через form-data
    fd.append("self_json", JSON.stringify(self));
    try {
      const res = await fetch("/api/intake/image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setPreview(json);
    } catch (e:any) {
      setErr(e.message || "Error");
    } finally { setLoading(false); }
  }, [self]);

  const onConfirm = useCallback(async (decision: { mode: "create"|"merge"|"update"; targetOrgId?: string|null; orgType?: "supplier"|"prospect"|"client" }) => {
    if (!preview) return;
    const payload = { normalized: preview.normalized, decision };
    const res = await fetch("/api/intake/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error || "Failed"); return; }
    setPreview(null);
    alert("Saved ✔");
  }, [preview]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Collect Info</h1>

      {/* My profile — живе тільки в sessionStorage цієї сесії */}
      <SelfPanel value={self} onChange={setSelf} onReset={reset} />

      <DropZone onDrop={onDrop} loading={loading} />

      {err && <div className="text-sm text-red-400">{err}</div>}

      {preview && <IntakePreview data={preview} onConfirm={onConfirm} />}
    </div>
  );
}

function SelfPanel({ value, onChange, onReset }:{
  value: { name:string; company:string; email:string; phone:string; domain:string },
  onChange: (v:any)=>void, onReset: ()=>void
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3">
      <div className="text-sm font-medium">My profile (session only)</div>
      <div className="grid md:grid-cols-5 gap-3">
        <Input label="Name"   value={value.name}    onChange={e=>onChange({...value, name: e.target.value})} />
        <Input label="Company" value={value.company} onChange={e=>onChange({...value, company: e.target.value})} />
        <Input label="Email"  value={value.email}   onChange={e=>onChange({...value, email: e.target.value})} />
        <Input label="Phone"  value={value.phone}   onChange={e=>onChange({...value, phone: e.target.value})} />
        <Input label="Domain" value={value.domain}  onChange={e=>onChange({...value, domain: e.target.value})} />
      </div>
      <div className="text-xs opacity-70">Ці дані не пишуться в БД — тільки на час сесії (sessionStorage). Вони будуть включені у промпт для парсингу.</div>
      <div><button className="rounded-lg px-3 py-1 bg-white/10 hover:bg-white/20 text-sm" onClick={onReset}>Clear</button></div>
    </div>
  );
}

function Input({label, value, onChange}:{label:string; value:string; onChange:any}) {
  return (
    <label className="text-sm space-y-1">
      <div className="opacity-70">{label}</div>
      <input className="w-full bg-transparent border rounded px-2 py-1" value={value} onChange={onChange} />
    </label>
  );
}

function DropZone({ onDrop, loading }: { onDrop: (f: File)=>void; loading:boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e)=>{e.preventDefault(); setOver(true);}}
      onDragLeave={()=>setOver(false)}
      onDrop={(e)=>{e.preventDefault(); setOver(false); const f=e.dataTransfer.files?.[0]; if(f) onDrop(f);}}
      className={`border-2 border-dashed rounded-2xl p-10 text-center ${over ? "border-white/60 bg-white/5" : "border-white/20"}`}
    >
      <div className="text-sm opacity-80">Drag & drop screenshot here, or click to upload</div>
      <input type="file" accept="image/*,application/pdf" className="mt-3" onChange={(e)=>{const f=e.target.files?.[0]; if(f) onDrop(f);}} disabled={loading} />
      {loading && <div className="mt-3 text-xs opacity-70">Processing…</div>}
    </div>
  );
}

function IntakePreview({ data, onConfirm }: { data: IntakePreview; onConfirm: (d:{mode:"create"|"merge"|"update";targetOrgId?:string|null;orgType?:"supplier"|"prospect"|"client"})=>void }) {
  const [mode, setMode] = useState<"create"|"merge"|"update">("create");
  const [orgType, setOrgType] = useState<"supplier"|"prospect"|"client">("prospect");
  const [target, setTarget] = useState<string>("");

  const c = data.normalized;
  const candidates = data.dedupe?.candidates || [];

  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <Section title="Who">
          <Field label="Name" value={c.who.name} />
          <Field label="Email" value={c.who.email} />
          <Field label="Phone" value={c.who.phone} />
          <Field label="Source" value={c.who.source} />
        </Section>
        <Section title="Company">
          <Field label="Legal name" value={c.company.legalName || c.company.displayName} />
          <Field label="Domain" value={c.company.domain} />
          <Field label="Country" value={c.company.country} />
        </Section>
        <Section title="Intent">
          <Field label="Type" value={c.intent.type} />
          <Field label="Brand" value={c.intent.brand} />
          <Field label="Product" value={c.intent.product} />
          <Field label="Quantity" value={c.intent.quantity} />
        </Section>
      </div>

      <div className="space-y-2">
        <div className="font-medium">Organization action</div>
        <div className="flex flex-wrap gap-4 items-center">
          <label><input type="radio" checked={mode==="create"} onChange={()=>setMode("create")} /> Create new</label>
          <label><input type="radio" checked={mode==="merge"} onChange={()=>setMode("merge")} /> Merge</label>
          <label><input type="radio" checked={mode==="update"} onChange={()=>setMode("update")} /> Update</label>
          {mode==="create" && (
            <span className="inline-flex items-center gap-2">
              <span className="text-sm opacity-70">Type</span>
              <select className="bg-transparent border rounded px-2 py-1" value={orgType} onChange={e=>setOrgType(e.target.value as any)}>
                <option value="supplier">Supplier</option>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
              </select>
            </span>
          )}
          {mode!=="create" && (
            <span className="inline-flex items-center gap-2">
              <span className="text-sm opacity-70">Target</span>
              <select className="bg-transparent border rounded px-2 py-1" value={target} onChange={(e)=>setTarget(e.target.value)}>
                <option value="">Select…</option>
                {candidates.map(cd=>(
                  <option key={cd.id} value={cd.id}>{cd.name} {cd.domain?`(${cd.domain})`:""}</option>
                ))}
              </select>
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20" onClick={()=>onConfirm({ mode, targetOrgId: target||null, orgType })}>
          Confirm & Save
        </button>
      </div>
    </div>
  );
}

function Section({title, children}:{title:string; children:any}) {
  return (
    <div>
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}
function Field({label, value}:{label:string; value:any}) {
  return (
    <div className="flex justify-between gap-4">
      <div className="opacity-70">{label}</div>
      <div className="font-mono text-right break-all">{value ?? <span className="opacity-50">—</span>}</div>
    </div>
  );
}
