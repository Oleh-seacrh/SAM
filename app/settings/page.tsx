"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/* ---------- Tabs ---------- */
export type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";
function isTab(v: string | null): v is Tab {
  return v === "profile" || v === "organization" || v === "users" || v === "billing" || v === "enrichment";
}

/* ---------- Enrichment config (залишено як було) ---------- */
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

const EnrichmentTab: React.FC = () => {
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
        const res = await fetch("/api/settings/enrich");
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
        <p className="text-sm opacity-80 mb-3">Оберіть, які типи даних SAM приймає для авто-збагачення.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.enrichBy.website} onChange={() => toggle(["enrichBy","website"])} />
            <span>Website / Domain</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.enrichBy.email} onChange={() => toggle(["enrichBy","email"])} />
            <span>Email</span>
          </label>
            <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.enrichBy.phone} onChange={() => toggle(["enrichBy","phone"])} />
            <span>Phone</span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.sources.web} onChange={() => toggle(["sources","web"])} />
            <span>Web Search</span>
          </label>

          <div>
            <div className="text-sm opacity-80 mb-1">Platforms</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.platforms.alibaba} onChange={() => toggle(["sources","platforms","alibaba"])} />
                <span>Alibaba</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.platforms.madeInChina} onChange={() => toggle(["sources","platforms","madeInChina"])} />
                <span>Made-in-China</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.platforms.indiamart} onChange={() => toggle(["sources","platforms","indiamart"])} />
                <span>Indiamart</span>
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm opacity-80 mb-1">Socials</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.socials.linkedin} onChange={() => toggle(["sources","socials","linkedin"])} />
                <span>LinkedIn</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.socials.facebook} onChange={() => toggle(["sources","socials","facebook"])} />
                <span>Facebook</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cfg.sources.socials.instagram} onChange={() => toggle(["sources","socials","instagram"])} />
                <span>Instagram</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Match policy</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.strictMatching} onChange={() => setCfg(p => ({ ...p, strictMatching: !p.strictMatching }))} />
            <span>Strict matching for company name</span>
          </label>
          <p className="text-xs opacity-70">
            Коли увімкнено — LinkedIn/платформи використовуються лише якщо назву компанії знайдено і вона достатньо близька.
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-medium mb-2">Output fields</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> <span>Company Name</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> <span>Country (ISO-2)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> <span>Industry / Category</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> <span>Contacts (email/phone/person)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" /> <span>Size (employees)</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" /> <span>Tags (Medical / NDT / Other)</span></label>
        </div>
      </section>
    </div>
  );
};

/* ---------- Profile Tab (нова форма) ---------- */
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

  const set = (k: keyof Profile) =>
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
        <L label="Your name"><input className="input" value={form.contact_name} onChange={set("contact_name")} /></L>
        <L label="Company name"><input className="input" value={form.company_name} onChange={set("company_name")} /></L>
        <L label="Company email"><input className="input" value={form.company_email} onChange={set("company_email")} /></L>
        <L label="Company phone"><input className="input" value={form.company_phone} onChange={set("company_phone")} /></L>
        <L label="Company domain"><input className="input" placeholder="example.com" value={form.company_domain} onChange={set("company_domain")} /></L>
        <L label="Country"><input className="input" placeholder="UA / Ukraine" value={form.company_country} onChange={set("company_country")} /></L>
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
        .input {
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

/* ---------- Settings Page Wrapper з синхронізацією query ---------- */
export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Початковий таб
  const initialTab: Tab = (() => {
    const q = searchParams.get("tab");
    return isTab(q) ? q : "profile";
  })();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Слухаємо зміни query (назад/вперед)
  useEffect(() => {
    const q = searchParams.get("tab");
    if (isTab(q) && q !== activeTab) setActiveTab(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", tab);
    router.replace(`/settings?${sp.toString()}`);
  }

  return (
    <div className="flex h-full">
      <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          {(["profile","organization","users","billing","enrichment"] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => selectTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md ${activeTab === tab ? "bg-white/10 font-medium" : "hover:bg-white/5"}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "organization" && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Organization</h2>
            <p className="text-sm opacity-80">Draft секція — заповнимо пізніше.</p>
          </section>
        )}
        {activeTab === "users" && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Users & Roles</h2>
            <p className="text-sm opacity-80">Draft секція — заповнимо пізніше.</p>
          </section>
        )}
        {activeTab === "billing" && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Billing</h2>
            <ul className="list-disc pl-5 text-sm">
              <li>Поточний план, ліміти</li>
              <li>Upgrade → редірект на сайт-візитку</li>
              <li>Історія оплат / Stripe customer portal</li>
            </ul>
          </section>
        )}
        {activeTab === "enrichment" && <EnrichmentTab />}
      </main>
    </div>
  );
}
