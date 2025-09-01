"use client";

import * as React from "react";
import { Users, UserRoundSearch, PackageSearch, Search, Globe, CalendarClock, DollarSign, ChevronDown, X } from "lucide-react";

type OrgType = "client" | "prospect" | "supplier";

interface OrgListItem {
  id: string;
  name: string;
  org_type: OrgType;
  website?: string | null;
  country?: string | null;
  last_contact_at?: string | null;
  brands?: string | null;
  products?: string | null;
  latest_inquiry_at?: string | null;
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

// ===== mini UI (без сторонніх пакетів)
function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "secondary" | "outline" }) {
  const map: Record<string, string> = {
    default: "bg-primary/15 text-primary border border-primary/20",
    secondary: "bg-white/5 text-foreground border border-white/10",
    outline: "border border-white/15 text-muted-foreground",
  };
  return <span className={`px-2 py-0.5 rounded-md text-[11px] ${map[variant]}`}>{children}</span>;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/5 ${className}`}>{children}</div>;
}
function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 border-b border-white/10 ${className}`}>{children}</div>;
}
function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}
function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`font-semibold ${className}`}>{children}</h3>;
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "secondary" | "outline"; size?: "sm" | "md" }) {
  const { className = "", variant = "default", size = "md", ...rest } = props;
  const vmap: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-white/10 hover:bg-white/15 text-foreground",
    outline: "border border-white/15 hover:bg-white/5 text-foreground",
  };
  const sm = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  return <button className={`rounded-lg ${sm} ${vmap[variant]} ${className}`} {...rest} />;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`w-full h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 ${className}`} {...rest} />;
}
function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

// ===== Modals
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[61] w-[min(720px,96vw)] rounded-2xl border border-white/10 bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ===== Data hooks
async function fetchOrgs(org_type: OrgType): Promise<OrgListItem[]> {
  const r = await fetch(`/api/orgs?org_type=${org_type}`, { cache: "no-store" });
  const j = await r.json();
  return j.data as OrgListItem[];
}

function useOrgs(org_type: OrgType) {
  const [data, setData] = React.useState<OrgListItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await fetchOrgs(org_type));
    } catch (e: any) {
      setError(e?.message ?? "Load error");
    } finally {
      setLoading(false);
    }
  }, [org_type]);

  React.useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

// ===== Row
function OrgRow({ item, onOpen, onDelete }: { item: OrgListItem; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <Card className="hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-shadow">
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight truncate">{item.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <Badge variant={item.org_type === "client" ? "default" : item.org_type === "prospect" ? "secondary" : "outline"}>{item.org_type}</Badge>
              {item.country ? <span>• {item.country}</span> : null}
              <span className="hidden md:inline">• Products: {item.products || "—"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {item.website ? (
              <a href={item.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Globe className="w-4 h-4" /> Website
              </a>
            ) : (
              <Badge variant="outline">No website</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Brands</div>
          <div>{item.brands || "—"}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Products (latest inquiry)</div>
          <div className="truncate" title={item.products || undefined}>{item.products || "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Deal value
          </div>
          <div>—</div>
        </div>
        <div className="md:col-span-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            <span>Last contact:</span>
            <span className="text-foreground font-medium">{fmtDate(item.last_contact_at)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)}>Open</Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(item.id)}>Delete</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Create Lead form
function NewLeadForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<OrgType>("prospect");
  const [website, setWebsite] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [items, setItems] = React.useState<Array<{ brand?: string; product: string; quantity?: number; unit?: string; unit_price?: number }>>([]);

  const addItem = () => setItems((s) => [...s, { product: "" }]);
  const updItem = (idx: number, patch: any) => setItems((s) => s.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const delItem = (idx: number) => setItems((s) => s.filter((_, i) => i !== idx));

  const save = async () => {
    const r = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, org_type: type, website: website || null, country: country || null }),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || "Create org error"); return; }

    if (items.length) {
      const r2 = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_id: j.id, summary: "Manual inquiry", items }),
      });
      if (!r2.ok) {
        const j2 = await r2.json();
        alert(j2.error || "Create inquiry error");
        return;
      }
    }
    onCreated();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Name *</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company or contact name" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Type</div>
          <select value={type} onChange={(e) => setType(e.target.value as OrgType)} className="w-full h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm">
            <option value="client">client</option>
            <option value="prospect">prospect</option>
            <option value="supplier">supplier</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Website</div>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Country</div>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="UA / AE / ..." />
        </div>
      </div>

      <Divider />

      <div className="flex items-center justify-between">
        <div className="font-medium">Inquiry items (optional)</div>
        <Button variant="secondary" onClick={addItem}>Add item</Button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No items yet.</div>
      ) : (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <Card key={idx}>
              <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Product *</div>
                  <Input value={it.product} onChange={(e) => updItem(idx, { product: e.target.value })} placeholder="e.g., X-ray film 8x10" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Brand</div>
                  <Input value={it.brand || ""} onChange={(e) => updItem(idx, { brand: e.target.value })} placeholder="Fujifilm / Konica" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Qty</div>
                  <Input type="number" value={it.quantity ?? ""} onChange={(e) => updItem(idx, { quantity: e.target.valueAsNumber || undefined })} placeholder="200" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Unit</div>
                  <Input value={it.unit || ""} onChange={(e) => updItem(idx, { unit: e.target.value })} placeholder="boxes / pcs" />
                </div>
                <div className="flex items-end justify-end">
                  <Button variant="outline" onClick={() => delItem(idx)}>Remove</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={save}>Create</Button>
      </div>
    </div>
  );
}

// ===== Details modal
function DetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    (async () => {
      const r = await fetch(`/api/orgs/${id}`, { cache: "no-store" });
      setData(await r.json());
    })();
  }, [id]);

  const org = data?.org;

  return (
    <Modal title={org ? org.name : "Loading..."} onClose={onClose}>
      {!org ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Type</div><div>{org.org_type}</div></div>
            <div><div className="text-xs text-muted-foreground">Country</div><div>{org.country || "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Website</div><div>{org.website ? <a className="text-primary hover:underline" href={org.website} target="_blank">Open</a> : "—"}</div></div>
          </div>

          <Divider />

          <div className="font-medium">Inquiries</div>
          {data.inquiries?.length ? (
            <div className="space-y-3">
              {data.inquiries.map((inq: any) => (
                <Card key={inq.id}>
                  <CardHeader className="py-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">{inq.summary || "(no summary)"}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(inq.created_at)}</div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {data.items?.[inq.id]?.length ? (
                      <div className="text-sm">
                        {data.items[inq.id].map((it: any) => (
                          <div key={it.id} className="flex justify-between gap-3 py-1">
                            <div className="truncate">{it.brand ? `${it.brand} — ` : ""}{it.product}</div>
                            <div className="text-muted-foreground">{it.quantity ?? "—"} {it.unit ?? ""}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No items</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No inquiries</div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ===== Tabs
function Tabs({
  active,
  onChange,
}: {
  active: "clients" | "prospects" | "suppliers";
  onChange: (v: "clients" | "prospects" | "suppliers") => void;
}) {
  const base = "px-3 py-2 rounded-lg text-sm border border-white/10";
  const activeCls = "bg-primary text-primary-foreground border-primary/30";
  const idle = "bg-white/5 hover:bg-white/10";
  return (
    <div className="inline-grid grid-cols-3 gap-2">
      <button className={`${base} ${active === "clients" ? activeCls : idle}`} onClick={() => onChange("clients")}>
        <span className="inline-flex items-center gap-2"><Users className="w-4 h-4" /> Clients</span>
      </button>
      <button className={`${base} ${active === "prospects" ? activeCls : idle}`} onClick={() => onChange("prospects")}>
        <span className="inline-flex items-center gap-2"><UserRoundSearch className="w-4 h-4" /> Prospects</span>
      </button>
      <button className={`${base} ${active === "suppliers" ? activeCls : idle}`} onClick={() => onChange("suppliers")}>
        <span className="inline-flex items-center gap-2"><PackageSearch className="w-4 h-4" /> Suppliers</span>
      </button>
    </div>
  );
}

function GroupSection({ title, icon, items, defaultOpen = true }: { title: string; icon: React.ReactNode; items: OrgListItem[]; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-muted-foreground mb-3">
        <div className="p-1 rounded-md bg-white/5">{icon}</div>
        <span>{title}</span>
        <ChevronDown className="w-4 h-4 ml-1 transition-transform group-open:rotate-180" />
        <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
      </summary>
      <div className="grid grid-cols-1 gap-3 mb-6">
        {items.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No records</CardContent></Card>
        ) : (
          items.map((it) => <OrgRow key={it.id} item={it} onOpen={() => {}} onDelete={() => {}} />)
        )}
      </div>
    </details>
  );
}

// ===== Page
export default function ClientsCRMPage() {
  const [mode, setMode] = React.useState<"tabs" | "sections">("tabs");
  const [tab, setTab] = React.useState<"clients" | "prospects" | "suppliers">("clients");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showNew, setShowNew] = React.useState(false);

  const orgTypeMap: Record<typeof tab, OrgType> = { clients: "client", prospects: "prospect", suppliers: "supplier" };
  const { data, loading, error, reload } = useOrgs(orgTypeMap[tab]);

  const onOpen = (id: string) => setOpenId(id);
  const onDelete = async (id: string) => {
    if (!confirm("Delete this organization?")) return;
    const r = await fetch(`/api/orgs/${id}`, { method: "DELETE" });
    if (!r.ok) { alert("Delete failed"); return; }
    reload();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Clients (CRM)</h1>
        <Button onClick={() => setShowNew(true)}>New Lead</Button>
      </div>

      {/* toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative md:w-96">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter by product/company…" className="pl-8" />
        </div>
        <div className="flex items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm">
            <option value="tabs">Tabs</option>
            <option value="sections">Sections</option>
          </select>
        </div>
      </div>

      {mode === "tabs" ? (
        <>
          <Tabs active={tab} onChange={(v) => setTab(v)} />
          <div className="mt-4">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-red-400">{error}</div>}
            {!loading && !error && (
              <div className="grid grid-cols-1 gap-3">
                {(data ?? []).map((it) => (
                  <OrgRow key={it.id} item={it} onOpen={onOpen} onDelete={onDelete} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-6 mt-2">
          {/* секції в режимі sections: підвантажуємо кожну групу окремо */}
          <SectionLoader title="Clients" icon={<Users className="w-4 h-4" />} type="client" />
          <Divider />
          <SectionLoader title="Prospects" icon={<UserRoundSearch className="w-4 h-4" />} type="prospect" />
          <Divider />
          <SectionLoader title="Suppliers" icon={<PackageSearch className="w-4 h-4" />} type="supplier" />
        </div>
      )}

      {showNew && (
        <Modal title="New Lead" onClose={() => setShowNew(false)}>
          <NewLeadForm
            onCreated={() => {
              setShowNew(false);
              reload();
            }}
          />
        </Modal>
      )}

      {openId && <DetailView id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// окремий лоадер для секційного режиму
function SectionLoader({ title, icon, type }: { title: string; icon: React.ReactNode; type: OrgType }) {
  const { data, loading, error } = useOrgs(type);
  if (loading) return <div className="text-sm text-muted-foreground">Loading {title.toLowerCase()}…</div>;
  if (error) return <div className="text-sm text-red-400">{error}</div>;
  return <GroupSection title={title} icon={icon} items={data ?? []} />;
}
