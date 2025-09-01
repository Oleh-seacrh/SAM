"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export default function ClientsPage() {
  const [tab, setTab] = useState<OrgType>("client");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OrgListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function load(t: OrgType) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/orgs?org_type=${t}`, { cache: "no-store" });
      const txt = await r.text();
      const j = txt ? JSON.parse(txt) : {};
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows((j.data as OrgListItem[]) ?? []);
    } catch (e: any) {
      setErr(e?.message || "Load error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay =
        `${r.name} ${r.country ?? ""} ${r.website ?? ""} ${r.products ?? ""} ${r.brands ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="px-5 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients (CRM)</h1>
        <Button onClick={() => setShowNew(true)}>New Lead</Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter by product/company..."
          className="max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as OrgType)}>
          <TabsList>
            <TabsTrigger value="client">Clients</TabsTrigger>
            <TabsTrigger value="prospect">Prospects</TabsTrigger>
            <TabsTrigger value="supplier">Suppliers</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      {loading && <div className="text-sm text-gray-400">Loading…</div>}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {!loading && !err && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-gray-400">
                No records
              </CardContent>
            </Card>
          ) : (
            filtered.map((it) => <OrgRow key={it.id} item={it} />)
          )}
        </div>
      )}

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await load(tab);
          }}
        />
      )}
    </div>
  );
}

function OrgRow({ item }: { item: OrgListItem }) {
  return (
    <Card className="border border-gray-700/40 hover:border-gray-500/50 transition">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium truncate">{item.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {item.org_type} • {item.country || "—"}
            </div>

            {(item.products || item.brands) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-2">
                {item.products && (
                  <span className="text-gray-300">
                    <span className="text-gray-400">Products:</span> {item.products}
                  </span>
                )}
                {item.brands && (
                  <span className="text-gray-300">
                    <span className="text-gray-400">Brands:</span> {item.brands}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 flex gap-2">
            {/* за бажанням підв'яжемо Open/Delete до відповідних API */}
            {/* <Button variant="outline" size="sm">Open</Button>
            <Button variant="destructive" size="sm">Delete</Button> */}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("prospect");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");

  type Item = { product: string; brand?: string; quantity?: number; unit?: string; unit_price?: number };
  const [items, setItems] = useState<Item[]>([]);
  const addItem = () => setItems((p) => [...p, { product: "" }]);
  const updateItem = (i: number, patch: Partial<Item>) =>
    setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      alert("Name is required");
      return;
    }
    try {
      setSaving(true);
      // 1) create organization
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

      // 2) optional inquiry with items
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
      <div className="absolute left-1/2 top-16 -translate-x-1/2 w-[720px] max-w-[92vw]">
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
                        <Input
                          placeholder="Product *"
                          value={it.product}
                          onChange={(e) => updateItem(i, { product: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          placeholder="Brand"
                          value={it.brand || ""}
                          onChange={(e) => updateItem(i, { brand: e.target.value })}
                        />
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
                        <Input
                          placeholder="Unit"
                          value={it.unit || ""}
                          onChange={(e) => updateItem(i, { unit: e.target.value })}
                        />
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
