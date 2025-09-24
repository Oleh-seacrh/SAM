"use client";
import { useState, useCallback, useEffect } from "react";

type ParsedInquiry = {
  who: { name?: string|null; email?: string|null; phone?: string|null; source: "email"|"whatsapp"|"other" };
  company: { legalName?: string|null; displayName?: string|null; domain?: string|null; country?: string|null; linkedin_url?: string|null; facebook_url?: string|null };
  intent: { type: "RFQ"|"Buy"|"Info"|"Support"; brand?: string|null; product?: string|null; quantity?: string|null; freeText?: string|null };
  meta: { confidence: number; rawText: string; imageUrl?: string|null };
};
type DedupCandidate = { id: string; name: string; domain?: string|null; match_type: string };
type IntakePreviewT = { normalized: ParsedInquiry; dedupe: { candidates: DedupCandidate[] } };

// простий тип для збагачення (MVP)
type EnrichSuggestion = { field: string; value: string; confidence?: number; source?: string };

// Модель профілю з /api/settings/profile
type TenantProfile = {
  contact_name: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_domain: string;
  company_country: string;
};

/* ------- Safe response utils to avoid 'Unexpected end of JSON input' ------- */
async function parseResponseSafe(res: Response): Promise<any | null> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await res.json(); } catch { return null; }
  }
  try {
    const text = await res.text();
    return text ? { message: text } : null;
  } catch { return null; }
}
function pickErrorMessage(res: Response, body: any | null, fallback = "Request failed") {
  if (body?.error) return String(body.error);
  if (body?.message) return String(body.message);
  if (!res.ok) return `${res.status} ${res.statusText}`.trim();
  return "Empty response from server";
}

export default function CollectPage() {
  const [preview, setPreview] = useState<IntakePreviewT | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- NEW: tenant profile from server (read-only) ----
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProfileLoading(true);
      setProfileErr(null);
      try {
        const r = await fetch("/api/settings/profile", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const p: TenantProfile = {
          contact_name: "",
          company_name: "",
          company_email: "",
          company_phone: "",
          company_domain: "",
          company_country: "",
          ...(j?.profile || {}),
        };
        if (!cancelled) setProfile(p);
      } catch (e: any) {
        if (!cancelled) setProfileErr(e?.message || "Failed to load profile");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // соцпосилання (передамо в /api/intake/confirm)
  const [socials, setSocials] = useState<{ linkedin_url: string; facebook_url: string }>({ linkedin_url: "", facebook_url: "" });

  const onDrop = useCallback(async (file: File) => {
    setLoading(true); setErr(null);
    const fd = new FormData();
    fd.append("file", file);

    // ← важливо: прокидуємо профіль у промпт через form-data (замість session-only)
    const safeProfile = profile || {
      contact_name: "",
      company_name: "",
      company_email: "",
      company_phone: "",
      company_domain: "",
      company_country: "",
    };
    fd.append("self_json", JSON.stringify({
      name: safeProfile.contact_name || "",
      company: safeProfile.company_name || "",
      email: safeProfile.company_email || "",
      phone: safeProfile.company_phone || "",
      domain: safeProfile.company_domain || "",
      country: safeProfile.company_country || "",
    }));

    try {
      const res = await fetch("/api/intake/image", { method: "POST", body: fd });
      const payload = await parseResponseSafe(res);

      if (!res.ok) throw new Error(pickErrorMessage(res, payload, "Upload failed"));
      if (!payload) throw new Error("Empty response from server");

      setPreview(payload);

      // префіл для socials з parsed (якщо LLM вже дав)
      const li = payload?.normalized?.company?.linkedin_url ?? "";
      const fb = payload?.normalized?.company?.facebook_url ?? "";
      setSocials({ linkedin_url: li || "", facebook_url: fb || "" });
    } catch (e:any) {
      setErr(e.message || "Error");
    } finally { setLoading(false); }
  }, [profile]);

  const onConfirm = useCallback(async (decision: { mode: "create"|"merge"|"update"; targetOrgId?: string|null; orgType?: "supplier"|"prospect"|"client" }, opts?: { apply?: EnrichSuggestion[] }) => {
    if (!preview) return;

    // застосовуємо вибрані пропозиції (тільки на клієнті перед відправкою)
    const normalizedToSave: ParsedInquiry = JSON.parse(JSON.stringify(preview.normalized));
    const picks = opts?.apply ?? [];
    for (const s of picks) {
      if (!s || !s.field) continue;
      setDeep(normalizedToSave as any, s.field, s.value);
    }

    const payload = { normalized: normalizedToSave, decision, socials };
    const res = await fetch("/api/intake/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });

    const out = await parseResponseSafe(res);
    if (!res.ok) { alert(pickErrorMessage(res, out, "Failed")); return; }

    setPreview(null);
    alert("Saved ✔");
  }, [preview, socials]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Collect Info</h1>
        <a href="/settings?tab=profile" className="text-sm underline opacity-80">Edit profile in Settings →</a>
      </div>

      {/* READ-ONLY profile from tenant settings */}
      <ProfileReadOnly profile={profile} loading={profileLoading} err={profileErr} />

      <DropZone onDrop={onDrop} loading={loading} />

      {err && <div className="text-sm text-red-400">{err}</div>}

      {preview && (
        <IntakePreview
          data={preview}
          onConfirm={onConfirm}
          socials={socials}
          onChangeSocials={setSocials}
        />
      )}
    </div>
  );
}

function ProfileReadOnly({ profile, loading, err }: { profile: TenantProfile | null; loading: boolean; err: string | null }) {
  if (loading) return <div className="rounded-xl border border-white/10 p-4 text-sm opacity-80">Loading profile…</div>;
  if (err) return <div className="rounded-xl border border-white/10 p-4 text-sm text-red-400">Profile: {err}</div>;
  const p = profile || {
    contact_name: "", company_name: "", company_email: "", company_phone: "", company_domain: "", company_country: "",
  };
  return (
    <div className="rounded-xl border border-white/10 p-4 space-y-3">
      <div className="text-sm font-medium">My profile (from tenant settings)</div>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <Field label="Name" value={p.contact_name || "—"} />
        <Field label="Company" value={p.company_name || "—"} />
        <Field label="Email" value={p.company_email || "—"} />
        <Field label="Phone" value={p.company_phone || "—"} />
        <Field label="Domain" value={p.company_domain || "—"} />
        <Field label="Country" value={p.company_country || "—"} />
      </div>
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

function IntakePreview({
  data,
  onConfirm,
  socials,
  onChangeSocials
}: {
  data: IntakePreviewT;
  onConfirm: (d:{mode:"create"|"merge"|"update";targetOrgId?:string|null;orgType?:"supplier"|"prospect"|"client"}, opts?:{apply?:EnrichSuggestion[]})=>void;
  socials: { linkedin_url: string; facebook_url: string };
  onChangeSocials: (v:{ linkedin_url: string; facebook_url: string }) => void;
}) {
  const [mode, setMode] = useState<"create"|"merge"|"update">("create");
  const [orgType, setOrgType] = useState<"supplier"|"prospect"|"client">("prospect");
  const [target, setTarget] = useState<string>("");

  const c = data.normalized;
  const candidates = data.dedupe?.candidates || [];

  // enrichment MVP
  const [findLoading, setFindLoading] = useState(false);
  const [findErr, setFindErr] = useState<string|null>(null);
  const [suggestions, setSuggestions] = useState<EnrichSuggestion[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggle = (i: number) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  async function onFindInfo() {
    try {
      setFindLoading(true); setFindErr(null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (target) headers["X-Org-ID"] = String(target);

      const res = await fetch("/api/enrich/org", {
        method: "POST",
        headers,
        body: JSON.stringify({
          orgId: null,
          domain: c.company.domain,
          name: c.company.legalName || c.company.displayName,
          email: c.who.email
        })
      });
      const json = await parseResponseSafe(res);
      if (!res.ok) throw new Error(pickErrorMessage(res, json, "Failed to find"));
      const sugg: EnrichSuggestion[] = (json?.suggestions || []) as EnrichSuggestion[];
      setSuggestions(sugg);
      // автопропозиції: лише ті, де поле порожнє
      const pre: Record<number, boolean> = {};
      sugg.forEach((s, i) => {
        if (!getDeep(c as any, s.field)) pre[i] = true;
      });
      setChecked(pre);
    } catch (e:any) {
      setFindErr(e.message || "Error");
    } finally {
      setFindLoading(false);
    }
  }

  function doConfirm() {
    const apply = suggestions.filter((_, i) => checked[i]);
    onConfirm({ mode, targetOrgId: target||null, orgType }, { apply });
  }

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
          {(c.company.linkedin_url || c.company.facebook_url) && (
            <div className="text-xs mt-2 space-x-3">
              {c.company.linkedin_url && <a className="underline" href={c.company.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
              {c.company.facebook_url && <a className="underline" href={c.company.facebook_url} target="_blank" rel="noopener noreferrer">Facebook</a>}
            </div>
          )}
        </Section>
        <Section title="Intent">
          <Field label="Type" value={c.intent.type} />
          <Field label="Brand" value={c.intent.brand} />
          <Field label="Product" value={c.intent.product} />
          <Field label="Quantity" value={c.intent.quantity} />
        </Section>
      </div>

      {/* Соцпосилання */}
      <fieldset className="mt-2 border border-white/10 rounded p-3">
        <legend className="px-1 text-sm text-gray-400">Socials (optional)</legend>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <div className="opacity-70">LinkedIn (company)</div>
            <input
              type="url"
              placeholder="https://www.linkedin.com/company/acme"
              className="w-full bg-transparent border rounded px-2 py-1"
              value={socials.linkedin_url}
              onChange={(e)=>onChangeSocials({ ...socials, linkedin_url: e.target.value })}
            />
          </label>
          <label className="text-sm space-y-1">
            <div className="opacity-70">Facebook (page)</div>
            <input
              type="url"
              placeholder="https://www.facebook.com/acme"
              className="w-full bg-transparent border rounded px-2 py-1"
              value={socials.facebook_url}
              onChange={(e)=>onChangeSocials({ ...socials, facebook_url: e.target.value })}
            />
          </label>
        </div>
      </fieldset>

      {/* Find info (MVP) */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="font-medium">Organization action</div>
          <button
            className="ml-auto rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
            onClick={onFindInfo}
            disabled={findLoading}
          >
            {findLoading ? "Searching…" : "Find info"}
          </button>
        </div>
        {findErr && <div className="text-xs text-red-400">{findErr}</div>}

        {!!suggestions.length && (
          <div className="rounded border border-white/10 p-3">
            <div className="text-sm opacity-80 mb-2">Suggestions (tick to apply before save)</div>
            <div className="space-y-1 text-sm">
              {suggestions.map((s, i)=>(
                <label key={i} className="flex items-start gap-2">
                  <input type="checkbox" checked={!!checked[i]} onChange={()=>toggle(i)} />
                  <span className="flex-1">
                    <span className="opacity-70">{s.field}</span>: <span className="font-mono">{String(s.value)}</span>
                    {typeof s.confidence === "number" && <span className="ml-2 text-xs opacity-60">conf {s.confidence.toFixed(2)}</span>}
                    {s.source && <span className="ml-2 text-xs underline opacity-60"><a href={s.source} target="_blank" rel="noopener noreferrer">source</a></span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
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
        <button className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20" onClick={doConfirm}>
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

/* ---------- невеликі утиліти для мерджа пропозицій ---------- */
function setDeep(obj: any, path: string, value: any) {
  if (!path) return;
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function getDeep(obj: any, path: string) {
  try {
    return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
  } catch { return undefined; }
}
