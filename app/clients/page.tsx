"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OrgListItem = {
  id: string;
  name: string;
  org_type: string;
  website?: string;
  country?: string;
  last_contact_at?: string;
  created_at: string;
  latest_inquiry_at?: string;
  brands?: string;
  products?: string;
};

export default function ClientsPage() {
  const [data, setData] = useState<OrgListItem[]>([]);
  const [tab, setTab] = useState<"client" | "prospect" | "supplier">("client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/orgs?org_type=${tab}`, { cache: "no-store" });
      const txt = await r.text();
      const j = txt ? JSON.parse(txt) : {};
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [tab]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Clients (CRM)</h1>
        <Button onClick={() => setShowNew(true)}>New Lead</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="client">Clients</TabsTrigger>
          <TabsTrigger value="prospect">Prospects</TabsTrigger>
          <TabsTrigger value="supplier">Suppliers</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-3">
          {data && data.length > 0 ? (
            data.map((it) => (
              <Card key={it.id}>
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{it.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.org_type} • {it.country || "—"}
                    </div>
                    {it.products && (
                      <div className="text-xs mt-1">
                        Products: {it.products}
                      </div>
                    )}
                    {it.brands && (
                      <div className="text-xs mt-1">Brands: {it.brands}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No records
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showNew && (
        <NewLeadForm onCreated={() => { setShowNew(false); reload(); }} />
      )}
    </div>
  );
}

function NewLeadForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"client" | "prospect" | "supplier">("prospect");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [items, setItems] = useState<{ product: string; brand?: string; quantity?: number; unit?: string; unit_price?: number }[]>([]);

  const addItem = () => {
    setItems([...items, { product: "", brand: "", quantity: 1, unit: "", unit_price: undefined }]);
  };

  const updateItem = (i: number, field: string, val: any) => {
    const copy = [...items];
    (copy[i] as any)[field] = val;
    setItems(copy);
  };

  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    // 1. Створюємо організацію
    const r = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, org_type: type, website: website || null, country: country || null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { alert(j?.error || "Create org error"); return; }

    // 2. Якщо додані позиції — створюємо заявку
    if (items.length) {
      const r2 = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_id: j.id, summary: "Manual inquiry", items }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { alert(j2?.error || "Create inquiry error"); return; }
    }

    onCreated();
  };

  return (
    <Card className="p-4 space-y-2">
      <Input placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />

      <Button variant="outline" onClick={addItem}>Add item</Button>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Product" value={it.product} onChange={(e) => updateItem(i, "product", e.target.value)} />
          <Input placeholder="Brand" value={it.brand} onChange={(e) => updateItem(i, "brand", e.target.value)} />
          <Input placeholder="Qty" type="number" value={it.quantity || ""} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value))} />
          <Button variant="destructive" onClick={() => removeItem(i)}>Remove</Button>
        </div>
      ))}

      <Button onClick={save}>Create</Button>
      <Button variant="ghost" onClick={onCreated}>Cancel</Button>
    </Card>
  );
}
