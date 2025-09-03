"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";

type Organization = {
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
  tags: string[] | null;        // text[] у БД
  size_tag: string | null;
  source: string | null;
  note: string | null;

  brand: string | null;
  product: string | null;
  quantity: string | null;
  deal_value_usd: number | null;

  last_contact_at: string | null; // ISO
  added_at?: string | null;
  updated_at?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
};

function isoToLocalDatetimeInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localDatetimeInputToISO(v: string | null | undefined) {
  if (!v) return null;
  // value from <input type="datetime-local"> is local time, interpret and convert to ISO
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    0,
    0
  ).toISOString();
}

function normalizeDomain(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    let v = raw.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
      v = new URL(v).hostname;
    } else {
      v = v.split("/")[0];
    }
    return v.replace(/^www\./, "");
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, "");
  }
}

export default function OpenOrganizationModal({ open, onOpenChange, orgId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [data, setData] = useState<Organization | null>(null);

  // блок скролу тла при відкритій модалці
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // завантаження даних при відкритті
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orgs/${orgId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`GET failed: ${res.status}`);
        const row = (await res.json()) as Organization;
        if (cancelled) return;
        // гарантуємо масив тегів
        const tags: string[] | null = Array.isArray(row.tags)
          ? row.tags
          : typeof (row as any).tags === "string"
          ? String((row as any).tags)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : null;
        setData({ ...row, tags });
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const disabled = saving || loading || !data;

  // локальні сеттери
  const setField = <K extends keyof Organization>(k: K, v: Organization[K]) =>
    setData((prev) => (prev ? { ...prev, [k]: v } : prev));

  // підготовка payload
  const payload = useMemo(() => {
    if (!data) return null;
    return {
      name: data.name ?? "",
      domain: normalizeDomain(data.domain ?? "") ?? "",
      country: data.country ?? "",
      industry: data.industry ?? "",

      general_email: data.general_email ?? "",
      contact_name: data.contact_name ?? "",
      contact_email: data.contact_email ?? "",
      contact_phone: data.contact_phone ?? "",

      status: data.status ?? "",
      size_tag: data.size_tag ?? "",
      source: data.source ?? "",
      note: data.note ?? "",

      brand: data.brand ?? "",
      product: data.product ?? "",
      quantity: data.quantity ?? "",
      deal_value_usd: data.deal_value_usd ?? null,

      last_contact_at: data.last_contact_at,

      // перетворимо масив тегів у CSV, бекенд сам зробить text[]
      tags: (data.tags ?? []).join(","),
    };
  }, [data]);

  async function onOk() {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.detail || json?.error || `PUT failed: ${res.status}`);
      }
      setToast({ type: "success", msg: "Saved" });
      onOpenChange(false);
    } catch (e: any) {
      setToast({ type: "error", msg: e?.message || "Save failed" });
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
      // автохов тосту
      setTimeout(() => setToast(null), 2500);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      aria-modal="true"
      role="dialog"
      aria-labelledby="org-modal-title"
    >
      <div
        className="absolute inset-0 bg-[color:var(--overlay,#000)]/70 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto">
        <div className="mx-3 my-8 w-full max-w-3xl rounded-2xl border shadow-2xl bg-[var(--bg)] text-[var(--text)] border-[var(--border)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-4 border-[var(--border)]">
            <h2 id="org-modal-title" className="text-lg font-semibold">
              {data?.name || "Organization"}
            </h2>
            <button
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            {loading && <p className="text-sm text-zinc-500">Loading…</p>}
            {error && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </p>
            )}
            {!!data && (
              <form
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onOk();
                }}
              >
                {/* Company */}
                <Field label="Company name">
                  <input
                    className="input"
                    value={data.name ?? ""}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </Field>
                <Field label="Domain">
                  <input
                    className="input"
                    placeholder="example.com"
                    value={data.domain ?? ""}
                    onChange={(e) => setField("domain", e.target.value)}
                  />
                </Field>

                <Field label="Country">
                  <input
                    className="input"
                    value={data.country ?? ""}
                    onChange={(e) => setField("country", e.target.value)}
                  />
                </Field>
                <Field label="Industry">
                  <input
                    className="input"
                    value={data.industry ?? ""}
                    onChange={(e) => setField("industry", e.target.value)}
                  />
                </Field>

                {/* Contacts */}
                <Field label="General email">
                  <input
                    className="input"
                    type="email"
                    value={data.general_email ?? ""}
                    onChange={(e) => setField("general_email", e.target.value)}
                  />
                </Field>
                <Field label="Contact person">
                  <input
                    className="input"
                    value={data.contact_name ?? ""}
                    onChange={(e) => setField("contact_name", e.target.value)}
                  />
                </Field>
                <Field label="Personal email">
                  <input
                    className="input"
                    type="email"
                    value={data.contact_email ?? ""}
                    onChange={(e) => setField("contact_email", e.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className="input"
                    value={data.contact_phone ?? ""}
                    onChange={(e) => setField("contact_phone", e.target.value)}
                  />
                </Field>

                {/* Meta */}
                <Field label="Status">
                  <select
                    className="input"
                    value={data.status ?? ""}
                    onChange={(e) => setField("status", e.target.value)}
                  >
                    {["", "New", "Contacted", "Qualified", "Negotiation", "Won", "Lost", "Blocked"].map(
                      (s) => (
                        <option key={s} value={s}>
                          {s || "—"}
                        </option>
                      )
                    )}
                  </select>
                </Field>
                <Field label="Size tag (S/M/L)">
                  <select
                    className="input"
                    value={data.size_tag ?? ""}
                    onChange={(e) => setField("size_tag", e.target.value)}
                  >
                    {["", "S", "M", "L"].map((s) => (
                      <option key={s} value={s}>
                        {s || "—"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Source">
                  <input
                    className="input"
                    value={data.source ?? ""}
                    onChange={(e) => setField("source", e.target.value)}
                  />
                </Field>
                <Field label="Tags (comma separated)">
                  <input
                    className="input"
                    value={(data.tags ?? []).join(",")}
                    onChange={(e) =>
                      setField(
                        "tags",
                        e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean)
                      )
                    }
                  />
                </Field>

                <Field label="Last contact at">
                  <input
                    className="input"
                    type="datetime-local"
                    value={isoToLocalDatetimeInput(data.last_contact_at)}
                    onChange={(e) =>
                      setField("last_contact_at", localDatetimeInputToISO(e.target.value))
                    }
                  />
                </Field>

                {/* Interest snapshot */}
                <Field label="Brand">
                  <input
                    className="input"
                    value={data.brand ?? ""}
                    onChange={(e) => setField("brand", e.target.value)}
                  />
                </Field>
                <Field label="Product">
                  <input
                    className="input"
                    value={data.product ?? ""}
                    onChange={(e) => setField("product", e.target.value)}
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    className="input"
                    value={data.quantity ?? ""}
                    onChange={(e) => setField("quantity", e.target.value)}
                  />
                </Field>
                <Field label="Deal value USD">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={data.deal_value_usd ?? ""}
                    onChange={(e) =>
                      setField(
                        "deal_value_usd",
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                  />
                </Field>

                <div className="md:col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    className="input h-28 resize-y"
                    value={data.note ?? ""}
                    onChange={(e) => setField("note", e.target.value)}
                  />
                </div>

                {/* readonly */}
                <div className="md:col-span-2 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                  <div>
                    <span className="font-medium">Created:</span>{" "}
                    {data.added_at ? new Date(data.added_at).toLocaleString() : "—"}
                  </div>
                  <div className="text-right">
                    <span className="font-medium">Updated:</span>{" "}
                    {data.updated_at ? new Date(data.updated_at).toLocaleString() : "—"}
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3 border-[var(--border)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm ring-1 ring-zinc-300 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onOk}
              className="rounded-lg px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50
                bg-[var(--accent,#2563eb)] hover:opacity-90"
            >
              {saving ? "Saving…" : "OK"}
            </button>
          </div>
        </div>
      </div>

      {/* toasts */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
          <div
            className={`pointer-events-auto rounded-lg px-3 py-2 text-sm shadow-lg ${
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

/* Small styled helpers */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/* Base inputs via Tailwind (non-invasive) */
declare global {
  interface HTMLElementTagNameMap {
    // no-op
  }
}

const base =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zin[...]";
const labelBase = "text-xs font-medium text-zinc-600 dark:text-zinc-300";

// Updated theme variables for .input and .label
const style = `
.input{
  width:100%;
  border-radius:0.5rem;
  border-width:1px;
  padding:0.5rem 0.75rem;
  font-size:0.875rem;

  background: var(--bg);
  color: var(--text);
  border-color: var(--border);
}
.label{
  font-size:.75rem;
  font-weight:600;
  color: var(--text);
  opacity:.75;
}
`;

// Utility classes via Tailwind; add small CSS classNames mapping
(Object.assign as any)(Field, {});
// attach classNames for reuse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__org_modal_styles_applied__ ||
  (() => {
    try {
      const exists = document.getElementById("org-modal-inline-style");
      if (!exists) {
        const s = document.createElement("style");
        s.id = "org-modal-inline-style";
        s.innerHTML = style;
        document.head.appendChild(s);
      }
      // eslint-disable-next-line no-empty
    } catch {}
  })();
