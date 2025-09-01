"use client";

import * as React from "react";
import { Users, UserRoundSearch, PackageSearch, Search, Globe, CalendarClock, DollarSign, ChevronDown } from "lucide-react";

// ---- Types ----
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
  deal_value?: number | null;
  latest_inquiry_at?: string | null;
}

// ---- Mock data (замінимо на API пізніше) ----
const MOCK: OrgListItem[] = [
  {
    id: "1",
    name: "Fuji DI-HT",
    org_type: "client",
    website: "https://ima-x.com",
    country: "AE",
    products: "X-ray film",
    brands: "Fujifilm",
    deal_value: null,
    last_contact_at: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Daniel Kimani",
    org_type: "prospect",
    website: null,
    country: "KE",
    products: "Konica 8x10 film",
    brands: "Konica",
    deal_value: null,
    last_contact_at: null,
  },
  {
    id: "3",
    name: "Cargo Movers",
    org_type: "supplier",
    website: "http://www.cargomovers.co.in",
    country: "IN",
    products: "Logistics / Sea freight",
    brands: null,
    deal_value: 0,
    last_contact_at: new Date().toISOString(),
  },
];

// ---- Helpers ----
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");
const fmtMoney = (v?: number | null) =>
  v == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// ---- Small UI primitives (без shadcn) ----
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

// ---- Row ----
function OrgRow({ item }: { item: OrgListItem }) {
  return (
    <Card className="hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-shadow">
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight truncate">{item.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <Badge variant={item.org_type === "client" ? "default" : item.org_type === "prospect" ? "secondary" : "outline"}>{item.org_type}</Badge>
              {item.country ? <span>• {item.country}</span> : null}
              <span className="hidden md:inline">• Products: {item.products ?? "—"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {item.website ? (
              <a href={item.website} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Globe className="w-4 h-4" />
                Website
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
          <div>{item.brands ?? "—"}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Products (latest inquiry)</div>
          <div className="truncate" title={item.products ?? undefined}>{item.products ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Deal value</div>
          <div>{fmtMoney(item.deal_value)}</div>
        </div>
        <div className="md:col-span-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            <span>Last contact:</span>
            <span className="text-foreground font-medium">{fmtDate(item.last_contact_at)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary">Open</Button>
            <Button size="sm" variant="outline">Delete</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Tabs (без зовнішніх бібліотек) ----
function Tabs({
  current,
  onChange,
}: {
  current: "clients" | "prospects" | "suppliers";
  onChange: (v: "clients" | "prospects" | "suppliers") => void;
}) {
  const common = "px-3 py-2 rounded-lg text-sm border border-white/10";
  const active = "bg-primary text-primary-foreground border-primary/30";
  const idle = "bg-white/5 hover:bg-white/10";
  return (
    <div className="inline-grid grid-cols-3 gap-2">
      <button className={`${common} ${current === "clients" ? active : idle}`} onClick={() => onChange("clients")}>
        <span className="inline-flex items-center gap-2"><Users className="w-4 h-4" /> Clients</span>
      </button>
      <button className={`${common} ${current === "prospects" ? active : idle}`} onClick={() => onChange("prospects")}>
        <span className="inline-flex items-center gap-2"><UserRoundSearch className="w-4 h-4" /> Prospects</span>
      </button>
      <button className={`${common} ${current === "suppliers" ? active : idle}`} onClick={() => onChange("suppliers")}>
        <span className="inline-flex items-center gap-2"><PackageSearch className="w-4 h-4" /> Suppliers</span>
      </button>
    </div>
  );
}

// ---- Collapsible Section (native <details>) ----
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
          items.map((it) => <OrgRow key={it.id} item={it} />)
        )}
      </div>
    </details>
  );
}

// ---- Toolbar ----
function Toolbar({
  viewMode,
  setViewMode,
  onCreate,
}: {
  viewMode: "tabs" | "sections";
  setViewMode: (m: "tabs" | "sections") => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "deal" | "name">("recent");

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3">
      <div className="relative md:w-96">
        <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by product/company…" className="pl-8" />
      </div>
      <div className="flex items-center gap-2">
        {/* простий select без зовнішніх UI-бібліотек */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="deal">Deal value</option>
          <option value="name">Name A→Z</option>
        </select>

        <div className="h-6 w-px bg-white/10 mx-1" />

        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as any)}
          className="h-10 rounded-lg bg-transparent border border-white/15 px-3 text-sm"
        >
          <option value="tabs">Tabs</option>
          <option value="sections">Sections</option>
        </select>
      </div>
      <div className="md:ml-auto">
        <Button onClick={onCreate}>New Lead</Button>
      </div>
    </div>
  );
}

// ---- Page ----
export default function ClientsCRMPage() {
  const [viewMode, setViewMode] = React.useState<"tabs" | "sections">("tabs");

  // Поки що береться з MOCK — потім підмінемо на fetch('/api/orgs?...')
  const clients = React.useMemo(() => MOCK.filter((x) => x.org_type === "client"), []);
  const prospects = React.useMemo(() => MOCK.filter((x) => x.org_type === "prospect"), []);
  const suppliers = React.useMemo(() => MOCK.filter((x) => x.org_type === "supplier"), []);

  const onCreate = () => {
    alert("Open New Lead modal");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clients (CRM)</h1>
      </div>

      <Toolbar viewMode={viewMode} setViewMode={setViewMode} onCreate={onCreate} />

      {viewMode === "tabs" ? (
        <div className="mt-4 space-y-4">
          <Tabs current="clients" onChange={() => setViewMode("tabs")} />
          <div className="mt-4">
            <div className="grid grid-cols-1 gap-3">
              {/* Для Tabs: малюємо одну активну категорію (за замовчуванням Clients) */}
              {clients.map((it) => <OrgRow key={it.id} item={it} />)}
            </div>
          </div>
          <div className="mt-2">
            {/* кнопки-перемикачі тримаємо зверху; якщо треба справжній таб-стейт між 3-ма, скажи — додам */}
            <div className="text-xs text-muted-foreground">Use the buttons above to switch categories (Tabs/Sections toggle is in the toolbar).</div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 mt-2">
          <GroupSection title="Clients" icon={<Users className="w-4 h-4" />} items={clients} />
          <div className="h-px bg-white/10" />
          <GroupSection title="Prospects" icon={<UserRoundSearch className="w-4 h-4" />} items={prospects} />
          <div className="h-px bg-white/10" />
          <GroupSection title="Suppliers" icon={<PackageSearch className="w-4 h-4" />} items={suppliers} />
        </div>
      )}
    </div>
  );
}
