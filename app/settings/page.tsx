"use client";

import React, { useEffect, useState } from "react";

/** Щоб не ловити prerender/ISR помилки на /settings */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------- Tabs ---------- */
type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";

export default function SettingsPage() {
  // Повертаємо дефолт як у тебе було — "enrichment"
  const [activeTab, setActiveTab] = useState<Tab>("enrichment");

  return (
    <div className="flex h-full">
      {/* Sidebar (зліва) */}
      <aside className="w-60 border-r border-white/10 bg-[var(--card,#0b0b0d)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          <TabButton tab="profile" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="organization" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="users" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="billing" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="enrichment" activeTab={activeTab} setActiveTab={setActiveTab} />
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "organization" && <DraftSection title="Organization" />}
        {activeTab === "users" && <DraftSection title="Users & Roles" />}
        {activeTab === "billing" && <DraftSection title="Billing" items={[
          "Поточний план, ліміти",
          "Upgrade → редірект на сайт-візитку/Stripe",
          "Історія оплат / customer portal",
        ]} />}
        {activeTab === "enrichment" && <EnrichmentTab />}
      </main>
    </div>
  );
}

function TabButton({
  tab,
  activeTab,
  setActiveTab,
}: {
  tab: Tab;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}) {
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  const active = activeTab === tab;
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`w-full text-left px-3 py-2 rounded-md ${
        active ? "bg-white/10 font-medium" : "hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function DraftSection({ title, items }: { title: string; items?: string[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {!items ? (
        <p className="text-sm opacity-80">Draft секція — заповнимо пізніше.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm opacity-80">
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </section>
  );
}

/* ---------- Profile Tab (реальна форма /api/settings/profile) ---------- */
type Profile = {
  contact_name: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_domain: string;
  company_country: string;
};

const emptyProfile: Profile = {
  contact_name: "",
  company_name: "",
  company_email: "",
  company_phone: "",
  company_domain: "",
  company_country: "",
};

function ProfileTab() {
  const [form, setForm] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null); setOk(false);
      try {
        const r = await fetch("/api/settings/profile", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const p: Profile = { ...emptyProfile, ...(j?.profile || {}) };
        if (!cancelled) setForm(p);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setField = (k: keyof Profile) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(s => ({ ...s, [k]: e.target.value }));

  async function onSave() {
    setSaving(true); setErr(null); setOk(false);
    try {
      const r = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOk(true);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm opacity-70">Loading…</div>;

  return (
    <section className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Profile</h2>
      <p className="text-sm opacity-80">
        Ці дані зберігаються для вашого tenant і використовуються у промптах та під час парсингу.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <L label="Your name"><input className="input" value={form.contact_name} onChange={setField("contact_name")} /></L>
        <L label="Company name"><input className="input" value={form.company_name} onChange={setField("company_name")} /></L>
        <L label="Company email"><input className="input" value={form.company_email} onChange={setField("company_email")} /></L>
        <L label="Company phone"><input className="input" value={form.company_phone} onChange={setField("company_phone")} /></L>
        <L label="Company domain"><input className="input" placeholder="example.com" value={form.company_domain} onChange={setField("company_domain")} /></L>
        <L label="Country"><input className="input" placeholder="UA / Ukraine" value={form.company_country} onChange={setField("company_country")} /></L>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {err && <span className="text-sm text-red-400">{err}</span>}
        {ok && <span className="text-sm text-emerald-400">Saved ✔</span>}
      </div>

      <style jsx>{`
        .input{
          width:100%;
          border-radius:0.5rem;
          border:1px solid var(--border,#1f2937);
          padding:0.5rem 0.75rem;
          font-size:0.875rem;
          background: var(--bg,#0b0b0d);
          color: var(--text,#e5e7eb);
          outline:none;
        }
      `}</style>
    </section>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm space-y-1">
      <div className="opacity-70">{label}</div>
      {children}
    </label>
  );
}

/* ---------- Enrichment Tab (мінімально сумісний) ---------- */
type EnrichConfig = {
  enrichBy: { website: boolean; email: boolean; phone: boolean };
  sources: {
    web: boolean;
    platforms: { alibaba: boolean; madeInChina: boolean; indiamart: boolean };
    socials: { linkedin: boolean; facebook: boolean; instagram: boolean };
  };
  strictMatching: boolean;
  timeBudgetMs: number;
  perSourceTimeoutMs: { site: number; web: number; linkedin: number; platforms: number };
};

const DEFAULT_CFG: EnrichConfig = {
  enrichBy: { website: true, email: true, phone: false },
  sources: {
    web: true,
    platforms: { alibaba: true, madeInChina: false, indiamart: false },
    socials: { linkedin: true, facebook: false, instagram: false },
  },
  strictMatching: true,
  timeBudgetMs: 12000,
  perSourceTimeoutMs: { site: 3000, web: 2000, linkedin: 2000, platforms: 3000 },
};

function EnrichmentTab() {
  const [cfg, setCfg] = useState<EnrichConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/settings/enrich", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!ignore) setCfg({ ...DEFAULT_CFG, ...data });
      } catch (e: any) {
        if (!ignore) setError(e?.message || "Failed to load settings");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const toggle = (path: string[]) => {
    setCfg(prev => {
      const next: EnrichConfig = JSON.parse(JSON.stringify(prev));
      if (path.length === 2) {
        // @ts-ignore
        next[path[0]][path[1]] = !next[path[0]][path[1]];
      } else if (path.length === 3) {
        // @ts-ignore
        next[path[0]][path[1]][path[2]] = !next[path[0]][path[1]][path[2]];
      }
      return next;
    });
  };

  async function onSave() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/settings/enrich", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save settings");
      }
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm opacity-80">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Enrichment Settings</h2>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs opacity-70">Saved</span>}
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <section>
        <h3 className="text-lg font-medium mb-2">Inputs</h3>
        <div className="space-y-2">
          <Check label="Website / Domain" checked={cfg.enrichBy.website} onChange={()=>toggle(["enrichBy","website"])} />
          <Check label="Email" checked={cfg.enrichBy.email} onChange={()=>toggle(["enrichBy","email"])} />
          <Check label="Phone" checked={cfg.enrichBy.phone} onChange={()=>toggle(["enrichBy","phone"])} />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-4">
          <Check label="Web Search" checked={cfg.sources.web} onChange={()=>toggle(["sources","web"])} />
          <div>
            <div className="text-sm opacity-80 mb-1">Platforms</div>
            <div className="space-y-2">
              <Check label="Alibaba" checked={cfg.sources.platforms.alibaba} onChange={()=>toggle(["sources","platforms","alibaba"])} />
              <Check label="Made-in-China" checked={cfg.sources.platforms.madeInChina} onChange={()=>toggle(["sources","platforms","madeInChina"])} />
              <Check label="Indiamart" checked={cfg.sources.platforms.indiamart} onChange={()=>toggle(["sources","platforms","indiamart"])} />
            </div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Socials</div>
            <div className="space-y-2">
              <Check label="LinkedIn" checked={cfg.sources.socials.linkedin} onChange={()=>toggle(["sources","socials","linkedin"])} />
              <Check label="Facebook" checked={cfg.sources.socials.facebook} onChange={()=>toggle(["sources","socials","facebook"])} />
              <Check label="Instagram" checked={cfg.sources.socials.instagram} onChange={()=>toggle(["sources","socials","instagram"])} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Match policy</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.strictMatching} onChange={()=>setCfg(p=>({...p, strictMatching: !p.strictMatching}))} />
          <span>Strict matching for company name</span>
        </label>
      </section>
    </div>
  );
}

function Check({label, checked, onChange}:{label:string; checked:boolean; onChange:()=>void}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
"use client";

import React, { useEffect, useState } from "react";

/** Щоб не ловити prerender/ISR помилки на /settings */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------- Tabs ---------- */
type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";

export default function SettingsPage() {
  // Повертаємо дефолт як у тебе було — "enrichment"
  const [activeTab, setActiveTab] = useState<Tab>("enrichment");

  return (
    <div className="flex h-full">
      {/* Sidebar (зліва) */}
      <aside className="w-60 border-r border-white/10 bg-[var(--card,#0b0b0d)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          <TabButton tab="profile" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="organization" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="users" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="billing" activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton tab="enrichment" activeTab={activeTab} setActiveTab={setActiveTab} />
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "organization" && <DraftSection title="Organization" />}
        {activeTab === "users" && <DraftSection title="Users & Roles" />}
        {activeTab === "billing" && <DraftSection title="Billing" items={[
          "Поточний план, ліміти",
          "Upgrade → редірект на сайт-візитку/Stripe",
          "Історія оплат / customer portal",
        ]} />}
        {activeTab === "enrichment" && <EnrichmentTab />}
      </main>
    </div>
  );
}

function TabButton({
  tab,
  activeTab,
  setActiveTab,
}: {
  tab: Tab;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
}) {
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  const active = activeTab === tab;
  return (
    <button
      onClick={() => setActiveTab(tab)}
      className={`w-full text-left px-3 py-2 rounded-md ${
        active ? "bg-white/10 font-medium" : "hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

function DraftSection({ title, items }: { title: string; items?: string[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {!items ? (
        <p className="text-sm opacity-80">Draft секція — заповнимо пізніше.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm opacity-80">
          {items.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </section>
  );
}

/* ---------- Profile Tab (реальна форма /api/settings/profile) ---------- */
type Profile = {
  contact_name: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_domain: string;
  company_country: string;
};

const emptyProfile: Profile = {
  contact_name: "",
  company_name: "",
  company_email: "",
  company_phone: "",
  company_domain: "",
  company_country: "",
};

function ProfileTab() {
  const [form, setForm] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null); setOk(false);
      try {
        const r = await fetch("/api/settings/profile", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const p: Profile = { ...emptyProfile, ...(j?.profile || {}) };
        if (!cancelled) setForm(p);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setField = (k: keyof Profile) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(s => ({ ...s, [k]: e.target.value }));

  async function onSave() {
    setSaving(true); setErr(null); setOk(false);
    try {
      const r = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setOk(true);
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm opacity-70">Loading…</div>;

  return (
    <section className="space-y-6 max-w-3xl">
      <h2 className="text-xl font-semibold">Profile</h2>
      <p className="text-sm opacity-80">
        Ці дані зберігаються для вашого tenant і використовуються у промптах та під час парсингу.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <L label="Your name"><input className="input" value={form.contact_name} onChange={setField("contact_name")} /></L>
        <L label="Company name"><input className="input" value={form.company_name} onChange={setField("company_name")} /></L>
        <L label="Company email"><input className="input" value={form.company_email} onChange={setField("company_email")} /></L>
        <L label="Company phone"><input className="input" value={form.company_phone} onChange={setField("company_phone")} /></L>
        <L label="Company domain"><input className="input" placeholder="example.com" value={form.company_domain} onChange={setField("company_domain")} /></L>
        <L label="Country"><input className="input" placeholder="UA / Ukraine" value={form.company_country} onChange={setField("company_country")} /></L>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="rounded-lg px-3 py-2 bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {err && <span className="text-sm text-red-400">{err}</span>}
        {ok && <span className="text-sm text-emerald-400">Saved ✔</span>}
      </div>

      <style jsx>{`
        .input{
          width:100%;
          border-radius:0.5rem;
          border:1px solid var(--border,#1f2937);
          padding:0.5rem 0.75rem;
          font-size:0.875rem;
          background: var(--bg,#0b0b0d);
          color: var(--text,#e5e7eb);
          outline:none;
        }
      `}</style>
    </section>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm space-y-1">
      <div className="opacity-70">{label}</div>
      {children}
    </label>
  );
}

/* ---------- Enrichment Tab (мінімально сумісний) ---------- */
type EnrichConfig = {
  enrichBy: { website: boolean; email: boolean; phone: boolean };
  sources: {
    web: boolean;
    platforms: { alibaba: boolean; madeInChina: boolean; indiamart: boolean };
    socials: { linkedin: boolean; facebook: boolean; instagram: boolean };
  };
  strictMatching: boolean;
  timeBudgetMs: number;
  perSourceTimeoutMs: { site: number; web: number; linkedin: number; platforms: number };
};

const DEFAULT_CFG: EnrichConfig = {
  enrichBy: { website: true, email: true, phone: false },
  sources: {
    web: true,
    platforms: { alibaba: true, madeInChina: false, indiamart: false },
    socials: { linkedin: true, facebook: false, instagram: false },
  },
  strictMatching: true,
  timeBudgetMs: 12000,
  perSourceTimeoutMs: { site: 3000, web: 2000, linkedin: 2000, platforms: 3000 },
};

function EnrichmentTab() {
  const [cfg, setCfg] = useState<EnrichConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/settings/enrich", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!ignore) setCfg({ ...DEFAULT_CFG, ...data });
      } catch (e: any) {
        if (!ignore) setError(e?.message || "Failed to load settings");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const toggle = (path: string[]) => {
    setCfg(prev => {
      const next: EnrichConfig = JSON.parse(JSON.stringify(prev));
      if (path.length === 2) {
        // @ts-ignore
        next[path[0]][path[1]] = !next[path[0]][path[1]];
      } else if (path.length === 3) {
        // @ts-ignore
        next[path[0]][path[1]][path[2]] = !next[path[0]][path[1]][path[2]];
      }
      return next;
    });
  };

  async function onSave() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/settings/enrich", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save settings");
      }
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm opacity-80">Loading…</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Enrichment Settings</h2>
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs opacity-70">Saved</span>}
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-2 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <section>
        <h3 className="text-lg font-medium mb-2">Inputs</h3>
        <div className="space-y-2">
          <Check label="Website / Domain" checked={cfg.enrichBy.website} onChange={()=>toggle(["enrichBy","website"])} />
          <Check label="Email" checked={cfg.enrichBy.email} onChange={()=>toggle(["enrichBy","email"])} />
          <Check label="Phone" checked={cfg.enrichBy.phone} onChange={()=>toggle(["enrichBy","phone"])} />
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-4">
          <Check label="Web Search" checked={cfg.sources.web} onChange={()=>toggle(["sources","web"])} />
          <div>
            <div className="text-sm opacity-80 mb-1">Platforms</div>
            <div className="space-y-2">
              <Check label="Alibaba" checked={cfg.sources.platforms.alibaba} onChange={()=>toggle(["sources","platforms","alibaba"])} />
              <Check label="Made-in-China" checked={cfg.sources.platforms.madeInChina} onChange={()=>toggle(["sources","platforms","madeInChina"])} />
              <Check label="Indiamart" checked={cfg.sources.platforms.indiamart} onChange={()=>toggle(["sources","platforms","indiamart"])} />
            </div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Socials</div>
            <div className="space-y-2">
              <Check label="LinkedIn" checked={cfg.sources.socials.linkedin} onChange={()=>toggle(["sources","socials","linkedin"])} />
              <Check label="Facebook" checked={cfg.sources.socials.facebook} onChange={()=>toggle(["sources","socials","facebook"])} />
              <Check label="Instagram" checked={cfg.sources.socials.instagram} onChange={()=>toggle(["sources","socials","instagram"])} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Match policy</h3>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.strictMatching} onChange={()=>setCfg(p=>({...p, strictMatching: !p.strictMatching}))} />
          <span>Strict matching for company name</span>
        </label>
      </section>
    </div>
  );
}

function Check({label, checked, onChange}:{label:string; checked:boolean; onChange:()=>void}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
