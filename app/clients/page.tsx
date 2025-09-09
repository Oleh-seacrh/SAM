"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserRoundSearch,
  PackageSearch,
  Search,
  Globe,
  CalendarClock,
  DollarSign,
  ChevronDown,
  ExternalLink,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import OpenOrganizationModal from "@/components/modals/OpenOrganizationModal";

/* =========================================================
 * Small helpers for display
 * =======================================================*/

type OrgType = "client" | "prospect" | "supplier";

const typeColor = (t?: OrgType | string | null) => {
  switch (t) {
    case "client":
      return "bg-emerald-500";
    case "prospect":
      return "bg-amber-500";
    case "supplier":
      return "bg-sky-500";
    default:
      return "bg-zinc-600/70";
  }
};

function formatMoney(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n}`;
  }
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString() : "—";

function domainHref(domain?: string | null) {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, "");
  return `https://${clean}`;
}

/* =========================================================
 * Types
 * =======================================================*/

type OrgListItem = {
  id: string;
  name: string;
  org_type: OrgType;

  domain?: string | null;
  country?: string | null;
  industry?: string | null;

  status?: string | null;
  size_tag?: string | null;
  source?: string | null;

  last_contact_at?: string | null;
  created_at: string;

  latest_inquiry_at?: string | null;
  brands?: string | null;
  products?: string | null;
  deal_value_usd?: number | null; // опційно, якщо є — покажемо
};

type Detail = {
  org: OrgListItem;
  inquiries: Array<{ id: string; summary?: string | null; created_at: string }>;
  items: Record<
    string,
    Array<{
      id: string;
      brand?: string | null;
      product?: string | null;
      quantity?: number | null;
      unit?: string | null;
      unit_price?: number | null;
    }>
  >;
};

type ViewMode = "tabs" | "sections";

/* =========================================================
 * API
 * =======================================================*/

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

/* =========================================================
 * Tiny UI primitives (unstyled)
 * =======================================================*/

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-[11px] bg-white/5 text-foreground border border-white/10">
      {children}
    </span>
  );
}

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
      className={`h-10 w-full rounded-lg bg-transparent border border-white/15 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
      {...rest}
    />
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 ${className}`}>
      {children}
    </div>
  );
}
function CardHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-3 border-b border-white/10 ${className}`}>{children}</div>
  );
}
function CardContent({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}

function Divider() {
  return <div className="h-px w-full bg-white/10" />;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[61] w-[min(920px,96vw)] rounded-2xl border border-white/10 bg-background">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* =========================================================
 * Row (Preview card) — UPDATED styles & content
 * =======================================================*/

function Row({
  item,
  onOpen,
  onDelete,
}: {
  item: OrgListItem;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const href = domainHref(item.domain);

  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      {/* Left color strip */}
      <span
        className={`absolute left-0 top-0 h-full w-[3px] ${typeColor(
          item.org_type
        )}`}
        aria-hidden
      />

      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Name bigger */}
            <div className="text-lg font-semibold leading-tight truncate">
              {item.name || "—"}
            </div>

            {/* Meta: type/country/industry */}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
              <Badge>{item.org_type}</Badge>
              {item.country ? <span>• {item.country}</span> : <span>• —</span>}
              {item.industry ? <span>• {item.industry}</span> : null}
              {/* optional chips */}
              <div className="inline-flex gap-1">
                {item.status ? (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                    {item.status}
                  </span>
                ) : null}
                {item.size_tag ? (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                    Size: {item.size_tag}
                  </span>
                ) : null}
                {item.source ? (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                    Source: {item.source}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Domain on the right */}
          <div className="flex items-center gap-2 shrink-0">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
                title={item.domain || undefined}
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">{item.domain}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-xs text-muted-foreground border border-white/10 rounded-md px-2 py-0.5">
                No website
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 text-[13px]">
        {/* Brands */}
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Brands</div>
          <div className="truncate" title={item.brands || undefined}>
            {item.brands || "—"}
          </div>
        </div>

        {/* Products */}
        <div className="md:col-span-2">
          <div className="text-[11px] text-muted-foreground mb-1">
            Products (latest inquiry)
          </div>
          <div className="truncate" title={item.products || undefined}>
            {item.products || "—"}
          </div>
        </div>

        {/* Deal value */}
        <div>
          <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Deal value
          </div>
          <div className="truncate" title={item.deal_value_usd?.toString()}>
            {formatMoney(item.deal_value_usd)}
          </div>
        </div>

        {/* Footer line */}
        <div className="md:col-span-4 mt-1 flex items-center justify-between text-[12px] text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            <span>Last contact:</span>
            <span className="text-foreground font-medium">
              {fmtDate(item.last_contact_at)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onOpen(item.id)}>
              Open
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(item.id)}>
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* =========================================================
 * Sections view
 * =======================================================*/

function GroupSection({
  title,
  icon,
  items,
  defaultOpen = true,
  onOpen,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  items: OrgListItem[];
  defaultOpen?: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
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
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No records
            </CardContent>
          </Card>
        ) : (
          items.map((it) => (
            <Row key={it.id} item={it} onOpen={onOpen} onDelete={onDelete} />
          ))
        )}
      </div>
    </details>
  );
}

/* ========= SoftLock dialog (центрований, з overlay) ========= */
function SoftLockDialog({
  open,
  candidates,
  onClose,
  onCreateAnyway,
}: {
  open: boolean;
  candidates: Array<{
    id: string | number;
    name: string;
    domain?: string | null;
    country?: string | null;
    org_type?: string | null;
    match?: { via_email?: string | null; domain_exact?: boolean; name_exact?: boolean };
  }>;
  onClose: () => void;
  onCreateAnyway: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl">
          <div className="px-5 py-4 border-b border-neutral-800">
            <div className="text-lg font-semibold">Possible duplicates found</div>
            <div className="text-sm text-neutral-400">We found similar organizations by domain / email / name.</div>
          </div>
          <div className="p-5 space-y-2 max-h-[60vh] overflow-auto">
            {candidates.map((o) => (
              <div key={o.id} className="rounded-xl border border-neutral-800 p-3">
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-neutral-400">
                  {o.domain ?? "—"} • {o.country ?? "—"} • {o.org_type ?? "—"}
                  {o.match?.via_email ? ` • via ${o.match.via_email}` : ""}
                  {o.match?.domain_exact ? " • domain exact" : ""}
                  {o.match?.name_exact ? " • name exact" : ""}
                </div>
                <a
                  className="text-sm underline inline-block mt-1"
                  href={`/orgs/${o.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open existing
                </a>
              </div>
            ))}
            {candidates.length === 0 && (
              <div className="text-sm text-neutral-400">No candidates</div>
            )}
          </div>
          <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-neutral-800">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onCreateAnyway}>Create anyway</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoticeDialog({
  open, title, message, onClose,
}: { open: boolean; title: string; message: string; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl">
          <div className="px-5 py-4 border-b border-neutral-800 text-lg font-semibold">{title}</div>
          <div className="p-5 text-sm text-neutral-300 whitespace-pre-wrap">{message}</div>
          <div className="px-5 py-4 border-t border-neutral-800 flex justify-end">
            <Button onClick={onClose}>OK</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== New Lead (оновлена) ===================== */
function NewLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("prospect");
  const [domain, setDomain] = useState("");
  const [country, setCountry] = useState("");

  // NEW: emails (comma/space separated)
  const [emailsInput, setEmailsInput] = useState("");
  const emails = useMemo(
    () => emailsInput.split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean),
    [emailsInput]
  );

  // Optional inquiry items (залишив як було)
  type Item = {
    product: string;
    brand?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
  };
  const [items, setItems] = useState<Item[]>([]);
  const addItem = () => setItems((p) => [...p, { product: "" }]);
  const updItem = (i: number, patch: Partial<Item>) =>
    setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const rmItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const [saving, setSaving] = useState(false);

  // Soft-lock state
  const [dupes, setDupes] = useState<any[]>([]);
  const [softOpen, setSoftOpen] = useState(false);
  const [override, setOverride] = useState(false);

  // NEW: notice dialog state (для заміни alert)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  const create = async (force = false) => {
    try {
      setSaving(true);
      const r = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(force || override ? { "x-allow-duplicate": "true" } : {}),
        },
        body: JSON.stringify({
          name: name || undefined,           // name більше не обов’язкове
          org_type: type,
          domain: domain || undefined,
          country: country || undefined,
          emails,                            // NEW
        }),
      });

      // Soft-lock (409) → показати діалог
      if (r.status === 409) {
        const j = await r.json().catch(() => ({}));
        if (j?.error === "DUPLICATE_SOFTLOCK") {
          setDupes(j?.duplicates ?? []);
          setSoftOpen(true);
          setOverride(false);
          return;
        }
        if (j?.error === "DUPLICATE_HARDLOCK") {
          setNotice({ title: "Duplicate detected", message: j?.detail || "Duplicate" });
          return;
        }
      }

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNotice({ title: "Create failed", message: j?.detail || j?.error || "Create org error" });
        return;
      }
      const orgId = j?.org?.id ?? j?.id;

      // створення inquiry (як і було)
      if (items.length && orgId) {
        const r2 = await fetch("/api/inquiries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ org_id: orgId, summary: "Manual inquiry", items }),
        });
        const j2 = await r2.json().catch(() => ({}));
        if (!r2.ok) {
          setNotice({ title: "Inquiry failed", message: j2?.detail || j2?.error || "Create inquiry error" });
          return;
        }
      }

      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const createAnyway = () => {
    setSoftOpen(false);
    setOverride(true);
    create(true);
  };

  // Загальний overlay для самої модалки (щоб фон не просвічував)
  return (
    <div className="fixed inset-0 z-[50]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 overflow-auto">
        <Modal title="New Lead" onClose={onClose}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Name (optional)</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company or contact name" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Type</div>
              <div className="flex gap-2">
                {(["prospect", "client", "supplier"] as OrgType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-3 py-2 rounded-md text-sm ${
                      type === t ? "bg-primary text-primary-foreground" : "bg-white/10 text-foreground hover:bg-white/15"
                    }`}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Domain</div>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Country</div>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="UA / AE / …" />
            </div>

            {/* NEW: Emails */}
            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Emails (comma/space separated)</div>
              <Input
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                placeholder="info@acme.com, sales@acme.com"
              />
            </div>
          </div>

          <Divider />

          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Inquiry items (optional)</div>
            <Button variant="secondary" onClick={addItem}>Add item</Button>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items yet.</div>
          ) : (
            <div className="space-y-3">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  <div className="md:col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Product *</div>
                    <Input value={it.product} onChange={(e) => updItem(i, { product: e.target.value })} placeholder="e.g., X-ray film 8x10" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Brand</div>
                    <Input value={it.brand ?? ""} onChange={(e) => updItem(i, { brand: e.target.value })} placeholder="Fujifilm / Konica" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Qty</div>
                    <Input type="number" value={it.quantity ?? ""} onChange={(e) => updItem(i, { quantity: Number(e.target.value || 0) })} placeholder="1000" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">Unit</div>
                      <Input value={it.unit ?? ""} onChange={(e) => updItem(i, { unit: e.target.value })} placeholder="box / set / …" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">Unit price</div>
                      <Input type="number" value={it.unit_price ?? ""} onChange={(e) => updItem(i, { unit_price: Number(e.target.value || 0) })} placeholder="5" />
                    </div>
                  </div>
                  <div className="md:col-span-5 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => rmItem(i)} className="mt-1">Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => create()} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </div>
        </Modal>
      </div>

      {/* Soft-lock діалог */}
      <SoftLockDialog
        open={softOpen}
        candidates={dupes}
        onClose={() => setSoftOpen(false)}
        onCreateAnyway={createAnyway}
      />

      {/* Notice dialog (заміна alert у модалці) */}
      <NoticeDialog
        open={!!notice}
        title={notice?.title || ""}
        message={notice?.message || ""}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}


/* =========================================================
 * Detail modal (unchanged)
 * =======================================================*/

function DetailModal({
  loading,
  detail,
  onClose,
}: {
  loading: boolean;
  detail: Detail | null;
  onClose: () => void;
}) {
  return (
    <Modal title="Details" onClose={onClose}>
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!loading && detail && (
        <div className="space-y-4">
          <div className="text-base font-semibold">{detail.org.name}</div>
          <div className="text-xs text-muted-foreground">
            {detail.org.org_type} • {detail.org.country || "—"} •{" "}
            {detail.org.domain || "—"}
          </div>

          <Divider />

          <div className="font-medium">Inquiries</div>
          {detail.inquiries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No inquiries yet.</div>
          ) : (
            <div className="space-y-3">
              {detail.inquiries.map((inq) => (
                <Card key={inq.id}>
                  <CardHeader className="py-2 flex items-center justify-between">
                    <div className="text-sm">
                      {inq.summary || "(no summary)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(inq.created_at)}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {(detail.items[inq.id] ?? []).length === 0 ? (
                      <div className="text-muted-foreground">No items</div>
                    ) : (
                      detail.items[inq.id].map((it) => (
                        <div
                          key={it.id}
                          className="flex justify-between gap-3 py-1"
                        >
                          <div className="truncate">
                            {it.brand ? `${it.brand} — ` : ""}
                            {it.product}
                          </div>
                          <div className="text-muted-foreground">
                            {it.quantity ?? "—"} {it.unit ?? ""}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* =========================================================
 * Page
 * =======================================================*/

export default function ClientsPage() {
  const router = useRouter();
  const [openOrg, setOpenOrg] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

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

  // NEW: page-level notice (заміна alert поза модалками)
  const [pageNotice, setPageNotice] = useState<{ title: string; message: string } | null>(null);

  const reload = async (which: OrgType | "all") => {
    setLoading(true);
    setErr(null);
    try {
      if (which === "all") {
        const [c, p, s] = await Promise.all([
          fetchList("client"),
          fetchList("prospect"),
          fetchList("supplier"),
        ]);
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

  useEffect(() => {
    if (view === "tabs") reload(tab);
    else reload("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, view]);

  const filterRows = (rows: OrgListItem[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.name} ${r.country ?? ""} ${r.domain ?? ""} ${
        r.products ?? ""
      } ${r.brands ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  };

  const clients = useMemo(() => filterRows(data.client), [data.client, query]);
  const prospects = useMemo(
    () => filterRows(data.prospect),
    [data.prospect, query]
  );
  const suppliers = useMemo(
    () => filterRows(data.supplier),
    [data.supplier, query]
  );

  const onOpen = async (id: string) => {
    setOpenId(id);
    setOpenLoading(true);
    try {
      const d = await fetchDetail(id);
      setDetail(d);
    } catch (e: any) {
      setPageNotice({ title: "Failed to load details", message: e?.message || "Unknown error" });
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
      setPageNotice({ title: "Delete failed", message: j?.error || `HTTP ${r.status}` });
      return;
    }
    await reload(t);
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
          <Input
            placeholder="Filter by product/company…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ViewMode)}
            className="h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm"
          >
            <option value="tabs">Tabs</option>
            <option value="sections">Sections</option>
          </select>

          {/* old-style tab buttons */}
          {view === "tabs" && (
            <div className="inline-grid grid-cols-3 gap-2 ml-1">
              <button
                className={`px-3 py-2 rounded-lg text-sm border ${
                  tab === "client"
                    ? "bg-primary text-primary-foreground border-primary/30"
                    : "bg-white/5 hover:bg-white/10 border-white/10"
                }`}
                onClick={() => setTab("client")}
              >
                <span className="inline-flex items-center gap-2">
                  <Users className="w-4 h-4" /> Clients
                </span>
              </button>
              <button
                className={`px-3 py-2 rounded-lg text-sm border ${
                  tab === "prospect"
                    ? "bg-primary text-primary-foreground border-primary/30"
                    : "bg-white/5 hover:bg-white/10 border-white/10"
                }`}
                onClick={() => setTab("prospect")}
              >
                <span className="inline-flex items-center gap-2">
                  <UserRoundSearch className="w-4 h-4" /> Prospects
                </span>
              </button>
              <button
                className={`px-3 py-2 rounded-lg text-sm border ${
                  tab === "supplier"
                    ? "bg-primary text-primary-foreground border-primary/30"
                    : "bg-white/5 hover:bg-white/10 border-white/10"
                }`}
                onClick={() => setTab("supplier")}
              >
                <span className="inline-flex items-center gap-2">
                  <PackageSearch className="w-4 h-4" /> Suppliers
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* content */}
      {err && <div className="text-sm text-red-400">{err}</div>}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && !err && (
        <>
          {view === "tabs" ? (
            <div className="grid grid-cols-1 gap-3">
              {(tab === "client" ? clients : tab === "prospect" ? prospects : suppliers).map(
                (it) => (
                  <Row
                    key={it.id}
                    item={it}
                    onOpen={(id) => {
                      // відкриваємо вашу велику модалку редагування
                      setSelectedOrgId(id);
                      setOpenOrg(true);
                    }}
                    onDelete={(id) => onDelete(id, it.org_type)}
                  />
                )
              )}
              {((tab === "client" ? clients : tab === "prospect" ? prospects : suppliers).length === 0) && (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    No records
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="space-y-6 mt-2">
              <GroupSection
                title="Clients"
                icon={<Users className="w-4 h-4" />}
                items={clients}
                onOpen={(id) => {
                  setSelectedOrgId(id);
                  setOpenOrg(true);
                }}
                onDelete={(id) => onDelete(id, "client")}
              />
              <Divider />
              <GroupSection
                title="Prospects"
                icon={<UserRoundSearch className="w-4 h-4" />}
                items={prospects}
                onOpen={(id) => {
                  setSelectedOrgId(id);
                  setOpenOrg(true);
                }}
                onDelete={(id) => onDelete(id, "prospect")}
              />
              <Divider />
              <GroupSection
                title="Suppliers"
                icon={<PackageSearch className="w-4 h-4" />}
                items={suppliers}
                onOpen={(id) => {
                  setSelectedOrgId(id);
                  setOpenOrg(true);
                }}
                onDelete={(id) => onDelete(id, "supplier")}
              />
            </div>
          )}
        </>
      )}

      {showNew && (
        <NewLeadModal
          onClose={() => setShowNew(false)}
          onCreated={async () => {
            setShowNew(false);
            await (view === "tabs" ? reload(tab) : reload("all"));
          }}
        />
      )}

      {/* Ваша існуюча модалка редагування організації */}
      {selectedOrgId && (
        <OpenOrganizationModal
          open={openOrg}
          onOpenChange={(v) => {
            setOpenOrg(v);
            if (!v) router.refresh();
          }}
          orgId={selectedOrgId}
        />
      )}

      {/* page-level notice (для помилок поза модалками) */}
      <NoticeDialog
        open={!!pageNotice}
        title={pageNotice?.title || ""}
        message={pageNotice?.message || ""}
        onClose={() => setPageNotice(null)}
      />
    </div>
  );
}

