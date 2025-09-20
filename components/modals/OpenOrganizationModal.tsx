"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type OrgDto = {
  id: string;
  name: string | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
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
  linkedin_url: string;
  facebook_url: string;
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
  quantity: string;        // текст у формі
  deal_value_usd: string;  // текст у формі
  last_contact_at: string; // ISO або локальний рядок
  tags: string;            // CSV у формі
};

const emptyForm: Form = {
  name: "",
  domain: "",
  country: "",
  industry: "",
  linkedin_url: "",
  facebook_url: "",
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

  // enrichment (MVP)
  const [enriching, setEnriching] = useState(false);
  const [suggestions, setSuggestions] = useState<{ field:string; value:string; confidence?:number; source?:string }[]>([]);
  const [pick, setPick] = useState<Record<number, boolean>>({});

  // Закрити по Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Підтягнути дані при відкритті
  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/orgs/${orgId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`GET ${r.status}`);
        const data = await r.json();
        const org: OrgDto = data?.org ?? data; // підтримує {org,...} або plain-row

        if (!cancelled) {
          setForm({
            name: org.name ?? "",
            domain: org.domain ?? "",
            country: org.country ?? "",
            industry: org.industry ?? "",
            linkedin_url: org.linkedin_url ?? "",
            facebook_url: org.facebook_url ?? "",
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

  const set = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name || null,
        domain: form.domain || null,
        country: form.country || null,
        industry: form.industry || null,
        linkedin_url: form.linkedin_url || null,
        facebook_url: form.facebook_url || null,
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

      onOpenChange(false);
      router.refresh(); // одразу побачиш зміни у списку/картках
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  // -------- Enrich (MVP) ----------
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
    try { return path.split(".").reduce((acc, k) => (acc ? (acc as any)[k] : undefined), obj); }
    catch { return undefined; }
  }

  // ——— валідації/мапінг підказок
  function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function normalizePhone(v: string): string | null {
    const only = v.replace(/[^\d+]/g, "");
    const hasPlus = only.startsWith("+");
    const digits = only.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    return (hasPlus ? "+" : "") + digits;
  }
  function normalizeDomainClient(raw: string): string | null {
    try {
      let v = String(raw).trim().toLowerCase();
      if (!v) return null;
      if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
      else v = v.split("/")[0];
      return v.replace(/^www\./, "");
    } catch {
      const s = String(raw).trim().toLowerCase();
      return s ? s.replace(/^www\./, "") : null;
    }
  }

  function mapSuggestionToForm(
    s: { field: string; value: string },
    current: Form
  ): { key?: keyof Form; val?: string } | null {
    const field = s.field;
    const value = String(s.value || "").trim();
    const domain = (current.domain || "").toLowerCase();

    if (field === "name" || field === "company.displayName") {
      return { key: "name", val: value };
    }
    if (field === "domain") {
      const d = normalizeDomainClient(value);
      if (d) return { key: "domain", val: d };
      return null;
    }

    if (field === "general_email" && isEmail(value)) {
      return { key: "general_email", val: value.toLowerCase() };
    }

    if (field === "contact_email" && isEmail(value)) {
      if (!current.contact_email) return { key: "contact_email", val: value.toLowerCase() };
      return null; // не перезаписуємо персональний
    }

    if (field === "who.email" && isEmail(value)) {
      if (domain && value.toLowerCase().endsWith("@" + domain)) {
        return { key: "general_email", val: value.toLowerCase() };
      }
      return null; // не корпоративний → ігноруємо
    }

    if (field === "contact_phone") {
      const p = normalizePhone(value);
      if (p && !current.contact_phone) return { key: "contact_phone", val: p };
      return null; // не перезаписуємо персональний
    }

    if (field === "who.phone") return null; // ніколи не пишемо

    return null;
  }

  function canApplySuggestion(s: { field: string; value: string }, current: Form) {
    const m = mapSuggestionToForm(s, current);
    return !!(m && m.key && m.val != null);
  }

  const onFindInfo = async () => {
    try {
      setEnriching(true);
      setSuggestions([]);
      setPick({});
      const r = await fetch("/api/enrich/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          domain: form.domain || null,
          name: form.name || null,
          email: form.contact_email || form.general_email || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

      const sugg = (j?.suggestions ?? []) as { field:string; value:string; confidence?:number; source?:string }[];
      setSuggestions(sugg);

      // автопозначаємо тільки ті, що реально можна застосувати і цільове поле зараз порожнє
      const pre: Record<number, boolean> = {};
      sugg.forEach((s, i) => {
        const m = mapSuggestionToForm(s, form);
        if (m?.key && !form[m.key]) pre[i] = true;
      });
      setPick(pre);
    } catch (e: any) {
      alert(e?.message || "Enrich failed");
    } finally {
      setEnriching(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      {/* Card */}
      <div className="relative mx-auto my-8 w-full max-w-3xl rounded-2xl border shadow-2xl bg-[var(--bg,#0b0b0d)] text-[var(--text,#e5e7eb)] border-[var(--border,#1f2937)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4 border-[var(--border,#1f2937)]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onFindInfo}
              className="rounded-md px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 disabled:opacity-50"
              disabled={enriching}
              title="Find info from the website (about/contact pages)"
            >
              {enriching ? "Searching…" : "Find info"}
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md px-2 py-1 text-sm hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-zinc-400">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <L label="Company name">
                  <input className="input" value={form.name} onChange={set("name")} />
                </L>
                <L label="Domain">
                  <input className="input" placeholder="example.com" value={form.domain} onChange={set("domain")} />
                </L>

                <L label="Country">
                  <input className="input" value={form.country} onChange={set("country")} />
                </L>
                <L label="Industry">
                  <input className="input" value={form.industry} onChange={set("industry")} />
                </L>

                {/* NEW: Socials */}
                <L label="LinkedIn URL">
                  <input
                    className="input"
                    placeholder="https://www.linkedin.com/company/..."
                    value={form.linkedin_url}
                    onChange={set("linkedin_url")}
                  />
                </L>
                <L label="Facebook URL">
                  <input
                    className="input"
                    placeholder="https://www.facebook.com/..."
                    value={form.facebook_url}
                    onChange={set("facebook_url")}
                  />
                </L>

                <L label="General email">
                  <input className="input" value={form.general_email} onChange={set("general_email")} />
                </L>
                <L label="Contact person">
                  <input className="input" value={form.contact_name} onChange={set("contact_name")} />
                </L>

                <L label="Personal email">
                  <input className="input" value={form.contact_email} onChange={set("contact_email")} />
                </L>
                <L label="Phone">
                  <input className="input" value={form.contact_phone} onChange={set("contact_phone")} />
                </L>

                <L label="Status">
                  <select className="input" value={form.status} onChange={set("status")}>
                    <option value="">—</option>
                    <option value="New">New</option>
                    <option value="In progress">In progress</option>
                    <option value="Won">Won</option>
                    <option value="Lost">Lost</option>
                  </select>
                </L>
                <L label="Size tag (S/M/L)">
                  <select className="input" value={form.size_tag} onChange={set("size_tag")}>
                    <option value="">—</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                  </select>
                </L>

                <L label="Source">
                  <input className="input" value={form.source} onChange={set("source")} />
                </L>
                <L label="Tags (comma separated)">
                  <input className="input" value={form.tags} onChange={set("tags")} />
                </L>

                <L label="Last contact at">
                  <input className="input" placeholder="YYYY-MM-DD or ISO" value={form.last_contact_at} onChange={set("last_contact_at")} />
                </L>
                <L label="Brand">
                  <input className="input" value={form.brand} onChange={set("brand")} />
                </L>

                <L label="Product">
                  <input className="input" value={form.product} onChange={set("product")} />
                </L>
                <L label="Quantity">
                  <input className="input" value={form.quantity} onChange={set("quantity")} />
                </L>

                <L label="Deal value USD">
                  <input className="input" value={form.deal_value_usd} onChange={set("deal_value_usd")} />
                </L>

                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <textarea className="input min-h-[120px]" value={form.note} onChange={set("note")} />
                </div>
              </div>

              {/* Suggestions from enrich */}
              {!!suggestions.length && (
                <div className="mt-3 rounded border border-white/10 p-3">
                  <div className="text-sm opacity-80 mb-2">Suggestions (tick to apply)</div>
                  <div className="space-y-1 text-sm">
                    {suggestions.map((s, i) => {
                      const applicable = canApplySuggestion(s, form);
                      const personalNote =
                        s.field === "contact_email" || s.field === "contact_phone" || s.field === "who.phone"
                          ? " (personal — won't overwrite)"
                          : s.field === "who.email"
                            ? " (mapped to general_email if corporate)"
                            : s.field === "domain"
                              ? " (will normalize)"
                              : "";

                      return (
                        <label key={i} className={`flex items-start gap-2 ${applicable ? "" : "opacity-50"}`}>
                          <input
                            type="checkbox"
                            checked={!!pick[i]}
                            disabled={!applicable}
                            onChange={() => {
                              if (!applicable) return;
                              setPick((prev) => ({ ...prev, [i]: !prev[i] }));
                            }}
                          />
                          <span className="flex-1">
                            <span className="opacity-70">{s.field}</span>{personalNote}:{" "}
                            <span className="font-mono">{String(s.value)}</span>
                            {typeof s.confidence === "number" && (
                              <span className="ml-2 text-xs opacity-60">conf {s.confidence.toFixed(2)}</span>
                            )}
                            {s.source && (
                              <span className="ml-2 text-xs underline opacity-60">
                                <a href={s.source} target="_blank" rel="noopener noreferrer">source</a>
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm"
                      onClick={() => {
                        const chosen = suggestions.filter((_, i) => pick[i]);
                        const next = { ...form };
                        for (const s of chosen) {
                          const m = mapSuggestionToForm(s, next);
                          if (m?.key && m.val != null) {
                            (next as any)[m.key] = m.val;
                          }
                        }
                        setForm(next);
                      }}
                    >
                      Apply selected
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 border-[var(--border,#1f2937)]">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50 bg-[var(--accent,#2563eb)] hover:opacity-90"
            disabled={saving}
          >
            {saving ? "Saving..." : "OK"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input{
          width:100%;
          border-radius:0.5rem;
          border-width:1px;
          padding:0.5rem 0.75rem;
          font-size:0.875rem;
          background: var(--bg,#0b0b0d);
          color: var(--text,#e5e7eb);
          border-color: var(--border,#1f2937);
          outline: none;
        }
        .label{
          display:block;
          font-size:.75rem;
          font-weight:600;
          color: var(--text,#e5e7eb);
          opacity:.75;
          margin-bottom: .25rem;
        }
      `}</style>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
