"use client";

import React, { useEffect, useMemo, useState } from "react";

/** невеличкі локальні примітиви (без залежностей) */
function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
    size?: "sm" | "md";
  }
) {
  const { className = "", variant = "default", size = "md", ...rest } = props;
  const vmap: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-white/10 hover:bg-white/15 text-foreground",
    outline: "border border-white/15 hover:bg-white/5 text-foreground",
    ghost: "hover:bg-white/10 text-foreground",
    destructive:
      "bg-red-600/80 text-white hover:bg-red-600 border border-red-500/40",
  };
  const sm = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm";
  return (
    <button
      className={`rounded-lg transition ${sm} ${vmap[variant]} ${className}`}
      {...rest}
    />
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`h-9 w-full rounded-lg bg-transparent border border-white/15 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
      {...rest}
    />
  );
}
function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

type InquirySummary = {
  id: string;
  org_id: string;
  summary?: string | null;
  created_at: string;
  items_count: number;
  brands?: string | null;
  products?: string | null;
  deal_value_usd?: number | null;
};

type Item = {
  id: string;
  inquiry_id: string;
  brand?: string | null;
  product?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  created_at: string;
};

export default function InquiriesModal({
  open,
  onClose,
  orgId,
  orgName,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<InquirySummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSummary, setNewSummary] = useState("");

  // розкриті запити → показуємо їх items
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [itemsByInquiry, setItemsByInquiry] = useState<Record<string, Item[]>>(
    {}
  );
  // інлайн “додати позицію” по кожному запиту
  const [draftByInquiry, setDraftByInquiry] = useState<
    Record<
      string,
      { brand: string; product: string; quantity?: number; unit?: string; unit_price?: number }
    >
  >({});

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, orgId]);

  async function reload() {
    setLoading(true);
    setErr(null);
    try {
      // ↓↓↓ no-store + анти-кеш мітка
      const r = await fetch(`/api/orgs/${orgId}/inquiries?ts=${Date.now()}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows(j?.items ?? []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(id: string) {
    const isOpen = !!expanded[id];
    if (isOpen) {
      setExpanded((p) => ({ ...p, [id]: false }));
      return;
    }
    // відкриваємо і, якщо немає, тягнемо items
    setExpanded((p) => ({ ...p, [id]: true }));
    if (!itemsByInquiry[id]) {
      // ↓↓↓ no-store + анти-кеш мітка
      const r = await fetch(`/api/inquiries/${id}/items?ts=${Date.now()}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) {
        setItemsByInquiry((m) => ({ ...m, [id]: j?.items ?? [] }));
      }
    }
  }

  async function createInquiry() {
    try {
      setCreating(true);
      const summaryToSend = newSummary || "Manual inquiry";
      const r = await fetch(`/api/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_id: orgId, summary: summaryToSend }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Create failed");

      setNewSummary("");

      // одразу тягнемо свіжий список (бек вже без кешу) і відкриваємо найновіший
      const rr = await fetch(`/api/orgs/${orgId}/inquiries?ts=${Date.now()}`, { cache: "no-store" });
      const jj = await rr.json();
      if (rr.ok) {
        const list = jj?.items ?? [];
        setRows(list);
        const latest = list[0];
        if (latest?.id) {
          setExpanded((p) => ({ ...p, [latest.id]: true }));
          // (не обов’язково) підтягнемо його айтеми, щоб одразу видно було
          const ri = await fetch(`/api/inquiries/${latest.id}/items?ts=${Date.now()}`, { cache: "no-store" });
          const ji = await ri.json().catch(() => ({}));
          if (ri.ok) setItemsByInquiry((m) => ({ ...m, [latest.id]: ji?.items ?? [] }));
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function deleteInquiry(id: string) {
    if (!confirm("Delete this inquiry?")) return;
    const r = await fetch(`/api/inquiries/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j?.error || "Delete failed");
      return;
    }
    setExpanded((p) => {
      const c = { ...p };
      delete c[id];
      return c;
    });
    await reload();
  }

  function setDraft(id: string, patch: Partial<{brand:string;product:string;quantity?:number;unit?:string;unit_price?:number;}>) {
    setDraftByInquiry((m) => ({ ...m, [id]: { brand: "", product: "", ...m[id], ...patch } }));
  }

  async function addItem(inqId: string) {
    const d = draftByInquiry[inqId] || { brand: "", product: "" };
    if (!d.product?.trim()) {
      alert("Product is required");
      return;
    }
    const payload = {
      brand: d.brand?.trim() || null,
      product: d.product?.trim(),
      quantity: typeof d.quantity === "number" ? d.quantity : null,
      unit: d.unit?.trim() || null,
      unit_price: typeof d.unit_price === "number" ? d.unit_price : null,
    };
    const r = await fetch(`/api/inquiries/${inqId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j?.error || "Add item failed");
      return;
    }
    // перезавантажимо items (no-store + анти-кеш мітка)
    const r2 = await fetch(`/api/inquiries/${inqId}/items?ts=${Date.now()}`, { cache: "no-store" });
    const j2 = await r2.json();
    if (r2.ok) {
      setItemsByInquiry((m) => ({ ...m, [inqId]: j2?.items ?? [] }));
      // оновимо агрегатну кількість у шапці
      setRows((old) =>
        old.map((x) =>
          x.id === inqId ? { ...x, items_count: (x.items_count ?? 0) + 1 } : x
        )
      );
      setDraftByInquiry((m) => ({ ...m, [inqId]: { brand: "", product: "" } }));
    }
  }

  async function deleteItem(id: string, inqId: string) {
    if (!confirm("Delete item?")) return;
    const r = await fetch(`/api/inquiry-items/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j?.error || "Delete failed");
      return;
    }
    // update list
    setItemsByInquiry((m) => {
      const arr = (m[inqId] ?? []).filter((x) => x.id !== id);
      return { ...m, [inqId]: arr };
    });
    setRows((old) =>
      old.map((x) =>
        x.id === inqId ? { ...x, items_count: Math.max(0, (x.items_count ?? 1) - 1) } : x
      )
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-[min(980px,96vw)] rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Inquiries</div>
              <div className="text-xs text-neutral-400">
                Organization: <span className="text-neutral-200">{orgName ?? orgId}</span>
              </div>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4 max-h-[70vh] overflow-auto">
            {/* New inquiry */}
            <div className="rounded-xl border border-white/10 p-3">
              <div className="text-sm font-medium mb-2">Create new inquiry</div>
              <div className="flex gap-2">
                <Input
                  placeholder="Summary (optional)"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                />
                <Button onClick={createInquiry} disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>

            <Divider />

            {err && <div className="text-sm text-red-400">{err}</div>}
            {loading && <div className="text-sm text-neutral-400">Loading…</div>}

            {!loading && rows.length === 0 && (
              <div className="text-sm text-neutral-400">No inquiries yet.</div>
            )}

            {!loading &&
              rows.map((r) => {
                const isOpen = !!expanded[r.id];
                const items = itemsByInquiry[r.id] ?? [];
                const draft = draftByInquiry[r.id] || { brand: "", product: "" };
                return (
                  <div key={r.id} className="rounded-xl border border-white/10">
                    <div className="px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {r.summary || "(no summary)"} •{" "}
                          <span className="text-neutral-400">{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-neutral-400 truncate">
                          {r.items_count ?? 0} items •{" "}
                          {r.brands ? `Brands: ${r.brands}` : "Brands: —"} •{" "}
                          {r.products ? `Products: ${r.products}` : "Products: —"} •{" "}
                          {r.deal_value_usd != null ? `Deal: $${Number(r.deal_value_usd).toFixed(2)}` : "Deal: —"}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="secondary" onClick={() => toggleExpand(r.id)}>
                          {isOpen ? "Hide items" : "Show items"}
                        </Button>
                        <Button variant="destructive" onClick={() => deleteInquiry(r.id)}>
                          Delete inquiry
                        </Button>
                      </div>
                    </div>

                    {isOpen && (
                      <>
                        <Divider />
                        {/* Items table */}
                        <div className="px-4 py-3 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-xs text-neutral-400">
                              <tr className="text-left">
                                <th className="py-2 pr-3">Brand</th>
                                <th className="py-2 pr-3">Product</th>
                                <th className="py-2 pr-3">Qty</th>
                                <th className="py-2 pr-3">Unit</th>
                                <th className="py-2 pr-3">Unit price</th>
                                <th className="py-2 pr-3">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => (
                                <tr key={it.id} className="border-t border-white/10">
                                  <td className="py-2 pr-3">{it.brand || "—"}</td>
                                  <td className="py-2 pr-3">{it.product || "—"}</td>
                                  <td className="py-2 pr-3">{it.quantity ?? "—"}</td>
                                  <td className="py-2 pr-3">{it.unit || "—"}</td>
                                  <td className="py-2 pr-3">
                                    {it.unit_price != null ? Number(it.unit_price).toFixed(2) : "—"}
                                  </td>
                                  <td className="py-2 pr-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => deleteItem(it.id, r.id)}
                                    >
                                      Delete
                                    </Button>
                                  </td>
                                </tr>
                              ))}

                              {/* add row */}
                              <tr className="border-t border-white/10">
                                <td className="py-2 pr-3">
                                  <Input
                                    placeholder="Brand"
                                    value={draft.brand}
                                    onChange={(e) => setDraft(r.id, { brand: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <Input
                                    placeholder="Product *"
                                    value={draft.product}
                                    onChange={(e) => setDraft(r.id, { product: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <Input
                                    type="number"
                                    placeholder="Qty"
                                    value={draft.quantity ?? ""}
                                    onChange={(e) =>
                                      setDraft(r.id, {
                                        quantity: e.target.value === "" ? undefined : Number(e.target.value),
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <Input
                                    placeholder="Unit"
                                    value={draft.unit ?? ""}
                                    onChange={(e) => setDraft(r.id, { unit: e.target.value })}
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <Input
                                    type="number"
                                    placeholder="Price"
                                    value={draft.unit_price ?? ""}
                                    onChange={(e) =>
                                      setDraft(r.id, {
                                        unit_price: e.target.value === "" ? undefined : Number(e.target.value),
                                      })
                                    }
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <Button size="sm" onClick={() => addItem(r.id)}>
                                    Add item
                                  </Button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
