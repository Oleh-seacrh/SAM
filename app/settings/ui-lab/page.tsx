"use client";

import React, { useMemo, useState } from "react";
import { Globe, CalendarClock, DollarSign, ExternalLink } from "lucide-react";

/** ===== Types kept small & local for the sandbox ===== */
type OrgType = "client" | "prospect" | "supplier";
type OrgStatus = string | null;
type SizeTag = string | null;

type OrgCardData = {
  id: string;
  name: string;
  org_type: OrgType;
  country?: string | null;     // can be "Bulgaria" or "BG"
  countryCode?: string | null; // prefer ISO code like "BG" if you have it
  industry?: string | null;
  status?: OrgStatus;
  size_tag?: SizeTag;
  source?: string | null;
  domain?: string | null;
  deal_value_usd?: number | null;
  last_contact_at?: string | null;
  brands?: string[] | null;
  products?: string[] | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

/** ===== Helpers (pure front) ===== */

// type color for the left stripe & active tab highlight idea
const typeColor = (t?: OrgType) => {
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
  if (n == null || Number.isNaN(n)) return null;
  try {
    // $100K style for large values
    if (Math.abs(n) >= 1000) {
      const short = Math.round(n / 1000);
      return `$${short}K`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n}`;
  }
}

function domainHref(domain?: string | null) {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, "");
  return `https://${clean}`;
}

function formatDateShort(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Emoji flag generator from ISO country code (no deps) */
function flagEmojiFromISO(code?: string | null) {
  if (!code) return null;
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return String.fromCodePoint(A + (cc.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (cc.charCodeAt(1) - base));
}

/** Small chip */
function Chip({
  children,
  title,
  intent = "neutral",
}: {
  children: React.ReactNode;
  title?: string;
  intent?: "neutral" | "success" | "warning" | "danger";
}) {
  const map: Record<typeof intent, string> = {
    neutral: "bg-white/8 text-zinc-200 border-white/10",
    success: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-200 border-amber-500/20",
    danger:  "bg-rose-500/15 text-rose-200 border-rose-500/20",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] ${map[intent]}`}
    >
      {children}
    </span>
  );
}

/** Section title */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-zinc-400 mb-1">{children}</div>;
}

/** ===== Card UI (preview) ===== */
function OrgCard({ item }: { item: OrgCardData }) {
  const href = domainHref(item.domain);
  const badgeStatusIntent: "neutral" | "success" | "warning" | "danger" = useMemo(() => {
    const s = (item.status || "").toLowerCase();
    if (["won", "active", "ok"].includes(s)) return "success";
    if (["lost", "closed", "blocked"].includes(s)) return "danger";
    if (["pending", "new"].includes(s)) return "warning";
    return "neutral";
  }, [item.status]);

  const countryFlag =
    item.countryCode ? flagEmojiFromISO(item.countryCode) : null;

  return (
    <div className="relative rounded-lg border border-white/10 bg-zinc-900/40 hover:bg-zinc-900/55 transition-colors">
      {/* left colored stripe */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-[3px] rounded-l ${typeColor(
          item.org_type
        )}`}
      />
      <div className="p-4">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{item.name}</div>

            <div className="mt-1 text-xs text-zinc-400 flex flex-wrap items-center gap-2">
              <Chip>
                {item.org_type}
              </Chip>
              {item.country || item.countryCode ? (
                <span className="inline-flex items-center gap-1">
                  {countryFlag && <span>{countryFlag}</span>}
                  <span className="truncate">{item.country || item.countryCode}</span>
                </span>
              ) : null}
              {item.industry && (
                <span className="truncate">• {item.industry}</span>
              )}
            </div>

            {/* chips line */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.status && <Chip intent={badgeStatusIntent}>{item.status}</Chip>}
              {item.size_tag && <Chip>Size: {item.size_tag}</Chip>}
              {item.source && <Chip>Source: {item.source}</Chip>}
              {item.contact_name && <Chip title={item.contact_phone || undefined}>👤 {item.contact_name}</Chip>}
            </div>
          </div>

          {/* right area — website + money */}
          <div className="flex items-center gap-4 shrink-0">
            {item.deal_value_usd != null && (
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-zinc-400">
                  <DollarSign className="w-3.5 h-3.5" />
                  Deal value
                </div>
                <div className="text-sm font-medium">
                  {formatMoney(item.deal_value_usd)}
                </div>
              </div>
            )}

            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
                title={item.domain || undefined}
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">{item.domain}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* body */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(item.brands?.length ?? 0) > 0 && (
            <div>
              <SectionTitle>Brands</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {(item.brands ?? []).slice(0, 4).map((b) => (
                  <Chip key={b} title={b}>{b}</Chip>
                ))}
                {(item.brands ?? []).length > 4 && (
                  <Chip>+{(item.brands ?? []).length - 4}</Chip>
                )}
              </div>
            </div>
          )}

          {(item.products?.length ?? 0) > 0 && (
            <div className="md:col-span-2">
              <SectionTitle>Products (latest inquiry)</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {(item.products ?? []).slice(0, 6).map((p) => (
                  <Chip key={p} title={p}>{p}</Chip>
                ))}
                {(item.products ?? []).length > 6 && (
                  <Chip>+{(item.products ?? []).length - 6}</Chip>
                )}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
          <div className="inline-flex items-center gap-1">
            <CalendarClock className="w-4 h-4" />
            <span>Last contact:</span>
            <span
              className="text-zinc-200"
              title={item.last_contact_at || undefined}
            >
              {formatDateShort(item.last_contact_at) ?? "—"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs hover:bg-primary/90"
              onClick={() => alert("Open → would show modal in the main app")}
            >
              Open
            </button>
            <button
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
              onClick={() => alert("More → context menu (Edit / Delete / …)")}
            >
              ⋯
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ===== Page: UI Lab ===== */
export default function UiLabPage() {
  // base mock
  const [data, setData] = useState<OrgCardData>({
    id: "demo-1",
    name: "Medem",
    org_type: "client",
    country: "Bulgaria",
    countryCode: "BG",
    industry: "Radiology",
    status: "Won",
    size_tag: "L",
    source: "God",
    domain: "xraymedem.com",
    deal_value_usd: 100000,
    last_contact_at: "2025-10-09T00:00:00.000Z",
    brands: [],
    products: [],
    contact_name: null,
    contact_phone: null,
  });

  const upd = <K extends keyof OrgCardData>(k: K, v: OrgCardData[K]) =>
    setData((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">UI Lab — Org Card</h1>
      <p className="text-sm text-zinc-400">
        Пісочниця для фронту. Тут усе на мок-даних — можна безпечно міняти
        стан і перевіряти візуал.
      </p>

      {/* Controls */}
      <div className="rounded-lg border border-white/10 p-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-900/30">
        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Type</div>
          <div className="flex gap-2">
            {(["client", "prospect", "supplier"] as OrgType[]).map((t) => (
              <button
                key={t}
                onClick={() => upd("org_type", t)}
                className={`px-3 py-2 rounded-md text-sm border ${
                  data.org_type === t
                    ? "bg-primary text-primary-foreground border-primary/30"
                    : "bg-white/5 hover:bg-white/10 border-white/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Country (name / ISO)</div>
          <div className="flex gap-2">
            <input
              className="h-10 flex-1 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="Country name (e.g., Bulgaria)"
              value={data.country ?? ""}
              onChange={(e) => upd("country", e.target.value || null)}
            />
            <input
              className="h-10 w-24 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="BG"
              value={data.countryCode ?? ""}
              onChange={(e) => upd("countryCode", e.target.value || null)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Deal value (USD)</div>
          <input
            className="h-10 w-full rounded-md bg-transparent border border-white/15 px-3 text-sm"
            type="number"
            placeholder="e.g. 100000"
            value={data.deal_value_usd ?? ""}
            onChange={(e) =>
              upd(
                "deal_value_usd",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Status / Size / Source</div>
          <div className="grid grid-cols-3 gap-2">
            <input
              className="h-10 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="Won"
              value={data.status ?? ""}
              onChange={(e) => upd("status", e.target.value || null)}
            />
            <input
              className="h-10 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="L"
              value={data.size_tag ?? ""}
              onChange={(e) => upd("size_tag", e.target.value || null)}
            />
            <input
              className="h-10 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="Source"
              value={data.source ?? ""}
              onChange={(e) => upd("source", e.target.value || null)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Brands (comma-sep)</div>
          <input
            className="h-10 w-full rounded-md bg-transparent border border-white/15 px-3 text-sm"
            placeholder="Fuji, Konica"
            value={(data.brands ?? []).join(", ")}
            onChange={(e) =>
              upd(
                "brands",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Products (comma-sep)</div>
          <input
            className="h-10 w-full rounded-md bg-transparent border border-white/15 px-3 text-sm"
            placeholder="X-ray film, DI-HL"
            value={(data.products ?? []).join(", ")}
            onChange={(e) =>
              upd(
                "products",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs text-zinc-400">Contact person / phone</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="h-10 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="Oleh"
              value={data.contact_name ?? ""}
              onChange={(e) => upd("contact_name", e.target.value || null)}
            />
            <input
              className="h-10 rounded-md bg-transparent border border-white/15 px-3 text-sm"
              placeholder="+380..."
              value={data.contact_phone ?? ""}
              onChange={(e) => upd("contact_phone", e.target.value || null)}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <OrgCard item={data} />
    </div>
  );
}
