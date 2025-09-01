"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Clock, DollarSign, Users, Search, Package, ExternalLink } from "lucide-react";

type OrgType = "client" | "prospect" | "supplier";

type OrgListItem = {
  id: string;
  name: string;
  org_type: OrgType;
  website?: string | null;
  country?: string | null;
  last_contact_at?: string | null;
  created_at: string;
  latest_inquiry_at?: string | null;
  brands?: string | null;
  products?: string | null;
};

type Detail = {
  org: OrgListItem;
  inquiries: Array<{ id: string; summary?: string | null; created_at: string }>;
  items: Record<
    string,
    Array<{ id: string; brand?: string | null; product?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number | null }>
  >;
};

type ViewMode = "tabs" | "sections";

/* ------------------------------ helpers ------------------------------ */

async function fetchList(org_type: OrgType) {
  const r = await fetch(`/api/orgs?org_type=${org_type}`, { cache: "no-store" });
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return (j.data ?? []) as OrgListItem[];
}

async function fetchDetail(id: string) {
  const r = await fetch(`/api/orgs/${id}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j as Detail;
}

/* ------------------------------- page -------------------------------- */

export default function ClientsPage() {
  const [view, setView] = useState<ViewMode>("tabs");
  const [tab, setTab] = useState<OrgType>("client");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Record<OrgType, OrgListItem[]>>({
    client: [],
    prospect: [],
    supplier: [],
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const reload = async (which: OrgType | "all") => {
    setLoading(true);
    setErr(null);
    try {
      if (which === "all") {
        const [c, p, s] = await Promise.all([fetchList("client"), fetchList("prospect"), fetchList("supplier")]);
        setData({ client: c, prospect: p, supplier: s });
      } else {
        const rows = await fetchList(which);
        setData((d) => ({ ...d, [which]: rows }));
      }
    } catch (e: any) {
      setErr(e?.message || "Load error");
    } finally {
      setLoading(false);
    }
  };

  // initial + on tab change
  useEffect(() => {
    if (view === "tabs") reload(tab);
    else reload("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, view]);

  const filterRows = (rows: OrgListItem[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.name} ${r.country ?? ""} ${r.website ?? ""} ${r.products ?? ""} ${r.brands ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  };

  const clients = useMemo(() => filterRows(data.client), [data.client, query]);
  const prospects = useMemo(() => filterRows(data.prospect), [data.prospect, query]);
  const suppliers = useMemo(() => filterRows(data.supplier), [data.supplier, query]);

  /* ------------------------------ actions ----------------------------- */

  const onOpen = async (id: string) => {
    setOpenId(id);
    setOpenLoading(true);
    try {
      const d = await fetchDetail(id);
      setDetail(d);
    } catch (e: any) {
      alert(e?.message || "Failed to load details");
      setOpenId(null);
    } finally {
      setOpenLoading(false);
    }
  };

  const onDelete = async (id: string, t: OrgType) => {
    if (!confirm("Delete this organization?")) return;
    const r = await fetch(`/api/orgs/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j?.error || "Delete failed");
      return;
    }
    // refresh current bucket
    await reload(t);
  };

  /* -------------------------------- UI -------------------------------- */

  return (
    <div className="px-6 py-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients (CRM)</h1>
        <Button onClick={() => setShowNew(true)}>New Lead</Button>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Input
            placeholder="Filter by product/company..."
            className="pl-9 w-[360px] max-w-[92vw]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={view}
            onChange={(e) => setView(e.target.value as ViewMode)}
          >
            <option value="tabs">Tabs</option>
            <option value="sections">Sections</option>
          </select>

          {view === "tabs" && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as OrgType)}>
              <TabsList>
                <TabsTrigger value="client">Clients</TabsTrigger>
                <TabsTrigger value="prospect">Prospects</TabsTrigger>
                <TabsTrigger value="supplier">Suppliers</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {/* content */}
      {err && <div className="text-sm text-red-500">{err}</div>}
      {loading && <div className="text-sm text-gray-400">Loading…</div>}

      {!loading && !err && (
        <>
          {view === "tabs" ? (
            <div className="space-y-3">
              <SectionList
                title={tabTitle(tab)}
                icon={tabIcon(tab)}
                rows={tab === "client" ? clients : tab === "prospect" ? prospects : suppliers}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <SectionList title="Clients" icon={<Users className="h-4 w-4" />} rows={clients} onOpen={onOpen} onDelete={onDelete} type="client" />
              <SectionList title="Prospects" icon={<Search className="h-4 w-4" />} rows={prospects} onOpen={onOpen} onDelete={onDelete} type="prospect" />
              <SectionList title="Suppliers" icon={<Package className="h-4 w-4" />} rows={suppliers} onOpen={onOpen} onDelete={onDelete} type="supplier" />
            </div>
          )}
        </>
      )}

      {/* New Lead modal */}
      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await (view === "tabs" ? reload(tab) : reload("all"));
          }}
        />
      )}

      {/* Detail modal */}
      {openId && (
        <DetailModal
          loading={openLoading}
          detail={detail}
          onClose={() => {
            setOpenId(null);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------- section + row ---------------------------- */

function tabTitle(t: OrgType) {
  if (t === "client") return "Clients";
  if (t === "prospect") return "Prospects";
  return "Suppliers";
}
function tabIcon(t: OrgType) {
  if (t === "client") return <Users className="h-4 w-4" />;
  if (t === "prospect") return <Search className="h-4 w-4" />;
  return <Package className="h-4 w-4" />;
}

function SectionList({
  title,
  icon,
  rows,
  onOpen,
  onDelete,
  type,
}: {
  title: string;
  icon: JSX.Element;
  rows: OrgListItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string, t: OrgType) => void;
  type?: OrgType;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        <span className="text-gray-500">({rows.length})</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-500">No records</CardContent>
        </Card>
      ) : (
        rows.map((it) => (
          <Card key={it.id} className="border border-gray-700/50 hover:border-gray-500/60 transition">
            <CardContent className="p-4">
              <Row item={it} onOpen={onOpen} onDelete={onDelete} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-200 text-[11px] border border-gray-700">{children}</span>;
}

function Row({
  item,
  onOpen,
  onDelete,
}: {
  item: OrgListItem;
  onOpen: (id: string) => void;
  onDelete: (id: string, t: OrgType) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{item.name}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <Badge>{item.org_type}</Badge>
            <span>•</span>
            <span>{item.country || "—"}</span>
            <span>•</span>
            <span>
              Products: <span className="text-gray-300">{item.products || "—"}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={item.website || "#"}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 text-xs ${item.website ? "text-blue-400 hover:text-blue-300" : "text-gray-600 pointer-events-none"}`}
            title={item.website || undefined}
          >
            <Globe className="h-4 w-4" />
            Website
            <ExternalLink className="h-3 w-3" />
          </a>

          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <DollarSign className="h-4 w-4" /> Deal value <span className="text-gray-300">—</span>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-4 w-4" /> Last contact <span className="text-gray-300">{formatDate(item.last_contact_at) || "—"}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpen(item.id)}>
              Open
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(item.id, item.org_type)}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(s?: string | null) {
  if (!s) return "";
  try {
    const d = new Date(s);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

/* ---------------------------- New Lead modal -------------------------- */

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("prospect");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  type Item = { product: string; brand?: string; quantity?: number; unit?: string; unit_price?: number };
  const [items, setItems] = useState<Item[]>([]);

  const addItem = () => setItems((p) => [...p, { product: "" }]);
  const updateItem = (i: number, patch: Partial<Item>) => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      alert("Name is required");
      return;
    }
    try {
      setSaving(true);
      // 1) create org
      const r = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          org_type: type,
          website: website.trim() || null,
          country: country.trim() || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(j?.error || "Create org error");
        return;
      }

      // 2) optional inquiry
      if (items.length) {
        const r2 = await fetch("/api/inquiries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            org_id: j.id,
            summary: "Manual inquiry",
            items,
          }),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok) {
          alert(j2?.error || "Create inquiry error");
          return;
        }
      }

      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-16 -translate-x-1/2 w-[820px] max-w-[92vw]">
        <Card className="border border-gray-700/50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">New Lead</div>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs text-gray-400">Name *</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company or contact name" />
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-400">Type</div>
                <div className="flex gap-2">
                  {(["prospect", "client", "supplier"] as OrgType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`px-3 py-2 rounded-md text-sm ${
                        type === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-400">Website</div>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-400">Country</div>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="UA / AE / …" />
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Inquiry items (optional)</div>
                <Button variant="outline" onClick={addItem}>
                  Add item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-xs text-gray-500">No items yet.</div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <Input placeholder="Product *" value={it.product} onChange={(e) => updateItem(i, { product: e.target.value })} />
                      </div>
                      <div className="col-span-3">
                        <Input placeholder="Brand" value={it.brand || ""} onChange={(e) => updateItem(i, { brand: e.target.value })} />
                      </div>
                      <div className="col-span-2">
                        <Input
                          placeholder="Qty"
                          type="number"
                          value={it.quantity ?? ""}
                          onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || undefined })}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input placeholder="Unit" value={it.unit || ""} onChange={(e) => updateItem(i, { unit: e.target.value })} />
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        <Button variant="destructive" onClick={() => removeItem(i)}>
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={create} disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------- Detail modal ---------------------------- */

function DetailModal({ loading, detail, onClose }: { loading: boolean; detail: Detail | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-16 -translate-x-1/2 w-[920px] max-w-[94vw]">
        <Card className="border border-gray-700/50">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-medium">Details</div>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>

            {loading && <div className="text-sm text-gray-400">Loading…</div>}

            {!loading && detail && (
              <div className="space-y-4">
                <div className="text-base font-semibold">{detail.org.name}</div>
                <div className="text-xs text-gray-400">
                  {detail.org.org_type} • {detail.org.country || "—"} • {detail.org.website || "—"}
                </div>

                <div className="space-y-3">
                  {detail.inquiries.length === 0 ? (
                    <div className="text-sm text-gray-500">No inquiries yet.</div>
                  ) : (
                    detail.inquiries.map((inq) => (
                      <div key={inq.id} className="rounded border border-gray-700/50 p-3">
                        <div className="text-sm font-medium">Inquiry • {new Date(inq.created_at).toLocaleString()}</div>
                        <div className="mt-1 text-xs text-gray-400">{inq.summary || "—"}</div>
                        <div className="mt-2 space-y-1">
                          {(detail.items[inq.id] ?? []).map((it) => (
                            <div key={it.id} className="text-sm">
                              <span className="text-gray-400">Product:</span> {it.product || "—"}
                              {it.brand ? (
                                <>
                                  {" "}
                                  <span className="text-gray-400">• Brand:</span> {it.brand}
                                </>
                              ) : null}
                              {typeof it.quantity === "number" ? (
                                <>
                                  {" "}
                                  <span className="text-gray-400">• Qty:</span> {it.quantity} {it.unit || ""}
                                </>
                              ) : null}
                              {typeof it.unit_price === "number" ? (
                                <>
                                  {" "}
                                  <span className="text-gray-400">• Price:</span> {it.unit_price}
                                </>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
