"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OrgDto = {
  id: string;
  name: string | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  general_email: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string | null;
  size_tag: string | null;
  source: string | null;
  note: string | null;
  brand: string | null;
  product: string | null;
  quantity: number | null;
  deal_value_usd: number | null;
  last_contact_at: string | null; // ISO
  tags: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  title?: string;
};

type Form = {
  name: string;
  domain: string;
  country: string;
  industry: string;
  general_email: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  size_tag: string;
  source: string;
  note: string;
  brand: string;
  product: string;
  quantity: string;        // у формі як текст
  deal_value_usd: string;  // у формі як текст
  last_contact_at: string; // локальний рядок або ISO
  tags: string;            // csv у формі
};

const emptyForm: Form = {
  name: "",
  domain: "",
  country: "",
  industry: "",
  general_email: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  status: "",
  size_tag: "",
  source: "",
  note: "",
  brand: "",
  product: "",
  quantity: "",
  deal_value_usd: "",
  last_contact_at: "",
  tags: "",
};

export default function OpenOrganizationModal({ open, onOpenChange, orgId, title = "Organization" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);

  // Підтягнути дані при відкритті
  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/orgs/${orgId}`);
        if (!r.ok) throw new Error(`GET ${r.status}`);
        const { org }: { org: OrgDto } = await r.json();

        if (!cancelled) {
          setForm({
            name: org.name ?? "",
            domain: org.domain ?? "",
            country: org.country ?? "",
            industry: org.industry ?? "",
            general_email: org.general_email ?? "",
            contact_name: org.contact_name ?? "",
            contact_email: org.contact_email ?? "",
            contact_phone: org.contact_phone ?? "",
            status: org.status ?? "",
            size_tag: org.size_tag ?? "",
            source: org.source ?? "",
            note: org.note ?? "",
            brand: org.brand ?? "",
            product: org.product ?? "",
            quantity: org.quantity == null ? "" : String(org.quantity),
            deal_value_usd: org.deal_value_usd == null ? "" : String(org.deal_value_usd),
            last_contact_at: org.last_contact_at ?? "",
            tags: (org.tags ?? []).join(", "),
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, orgId]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const setSelect = (k: keyof Form) => (v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name || null,
        domain: form.domain || null,
        country: form.country || null,
        industry: form.industry || null,
        general_email: form.general_email || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        status: form.status || null,
        size_tag: form.size_tag || null,
        source: form.source || null,
        note: form.note || null,
        brand: form.brand || null,
        product: form.product || null,
        quantity: form.quantity === "" ? null : Number(form.quantity),
        deal_value_usd: form.deal_value_usd === "" ? null : Number(form.deal_value_usd),
        last_contact_at: form.last_contact_at || null,
        tags: form.tags
          ? form.tags.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
      };

      const r = await fetch(`/api/orgs/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error || `PUT failed: ${r.status}`);
      }

      // Можна оновити локально за відповіддю, але ми все одно робимо refresh
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Форма */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">Company name</label>
            <Input value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Domain</label>
            <Input placeholder="example.com" value={form.domain} onChange={set("domain")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Country</label>
            <Input value={form.country} onChange={set("country")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Industry</label>
            <Input value={form.industry} onChange={set("industry")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">General email</label>
            <Input value={form.general_email} onChange={set("general_email")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Contact person</label>
            <Input value={form.contact_name} onChange={set("contact_name")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Personal email</label>
            <Input value={form.contact_email} onChange={set("contact_email")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Phone</label>
            <Input value={form.contact_phone} onChange={set("contact_phone")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Status</label>
            <Select value={form.status} onValueChange={setSelect("status")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In progress">In progress</SelectItem>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Size tag (S/M/L)</label>
            <Select value={form.size_tag} onValueChange={setSelect("size_tag")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">—</SelectItem>
                <SelectItem value="S">S</SelectItem>
                <SelectItem value="M">M</SelectItem>
                <SelectItem value="L">L</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Source</label>
            <Input value={form.source} onChange={set("source")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Tags (comma separated)</label>
            <Input value={form.tags} onChange={set("tags")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Last contact at</label>
            <Input value={form.last_contact_at} onChange={set("last_contact_at")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Brand</label>
            <Input value={form.brand} onChange={set("brand")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Product</label>
            <Input value={form.product} onChange={set("product")} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Quantity</label>
            <Input value={form.quantity} onChange={set("quantity")} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Deal value USD</label>
            <Input value={form.deal_value_usd} onChange={set("deal_value_usd")} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-muted-foreground">Notes</label>
            <Textarea value={form.note} onChange={set("note")} rows={4} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "OK"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
