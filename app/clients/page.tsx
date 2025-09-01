"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserRoundSearch,
  PackageSearch,
  Search,
  Globe,
  CalendarClock,
  DollarSign,
  ChevronDown,
} from "lucide-react";

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

// ---- Mock data (replace with API once ready) ----
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

// ---- Reusable row card (compact; matches your columns meaning) ----
function OrgRow({ item }: { item: OrgListItem }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
      <Card className="hover:shadow-sm">
        <CardHeader className="py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base leading-tight truncate">{item.name}</CardTitle>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <Badge
                  variant={item.org_type === "client" ? "default" : item.org_type === "prospect" ? "secondary" : "outline"}
                  className="capitalize"
                >
                  {item.org_type}
                </Badge>
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
                <Badge variant="outline" className="text-[10px]">No website</Badge>
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
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Deal value
            </div>
            <div>{fmtMoney(item.deal_value)}</div>
          </div>
          <div className="md:col-span-4 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              <span>Last contact:</span>
              <span className="text-foreground font-medium">{fmtDate(item.last_contact_at)}</span>
            </div>
            {/* Actions placeholder */}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary">Open</Button>
              <Button size="sm" variant="outline">Delete</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---- Group section (collapsible via details/summary) ----
function GroupSection({
  title,
  icon,
  items,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  items: OrgListItem[];
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-muted-foreground mb-3">
        <div className="p-1 rounded-md bg-muted">{icon}</div>
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
        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="deal">Deal value</SelectItem>
            <SelectItem value="name">Name A→Z</SelectItem>
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="h-6" />
        <Select value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="View" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tabs">Tabs</SelectItem>
            <SelectItem value="sections">Sections</SelectItem>
          </SelectContent>
        </Select>
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

  // TODO: replace with real fetchers:
  // const clients = useSWR<OrgListItem[]>("/api/orgs?org_type=client");
  // const prospects = useSWR<OrgListItem[]>("/api/orgs?org_type=prospect");
  // const suppliers = useSWR<OrgListItem[]>("/api/orgs?org_type=supplier");

  const clients = React.useMemo(() => MOCK.filter((x) => x.org_type === "client"), []);
  const prospects = React.useMemo(() => MOCK.filter((x) => x.org_type === "prospect"), []);
  const suppliers = React.useMemo(() => MOCK.filter((x) => x.org_type === "supplier"), []);

  const onCreate = () => {
    // open create-lead modal (org + optional inquiry)
    alert("Open New Lead modal");
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clients (CRM)</h1>
      </div>

      <Toolbar viewMode={viewMode} setViewMode={setViewMode} onCreate={onCreate} />

      {viewMode === "tabs" ? (
        <Tabs defaultValue="clients" className="mt-4">
          <TabsList className="grid grid-cols-3 w-full md:w-auto">
            <TabsTrigger value="clients" className="gap-2"><Users className="w-4 h-4" /> Clients</TabsTrigger>
            <TabsTrigger value="prospects" className="gap-2"><UserRoundSearch className="w-4 h-4" /> Prospects</TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2"><PackageSearch className="w-4 h-4" /> Suppliers</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="mt-4">
            {clients.map((it) => <OrgRow key={it.id} item={it} />)}
          </TabsContent>
          <TabsContent value="prospects" className="mt-4">
            {prospects.map((it) => <OrgRow key={it.id} item={it} />)}
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            {suppliers.map((it) => <OrgRow key={it.id} item={it} />)}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6 mt-2">
          <GroupSection title="Clients" icon={<Users className="w-4 h-4" />} items={clients} />
          <Separator />
          <GroupSection title="Prospects" icon={<UserRoundSearch className="w-4 h-4" />} items={prospects} />
          <Separator />
          <GroupSection title="Suppliers" icon={<PackageSearch className="w-4 h-4" />} items={suppliers} />
        </div>
      )}
    </div>
  );
}
