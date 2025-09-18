"use client";

import React, { useEffect, useState } from "react";

type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";

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

  // load config
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/settings/enrich");
        const data = await res.json();
        if (!ignore) setCfg({ ...DEFAULT_CFG, ...data });
      } catch (e: any) {
        if (!ignore) setError(e?.message || "Failed to load settings");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  // update helpers
  const toggle = (path: string[]) => {
    setCfg(prev => {
      // уникаємо structuredClone для SSR-оточення
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

      {/* Inputs */}
      <section>
        <h3 className="text-lg font-medium mb-2">Inputs</h3>
        <p className="text-sm opacity-80 mb-3">Оберіть, які типи даних SAM приймає для авто-збагачення.</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.enrichBy.website}
              onChange={() => toggle(["enrichBy","website"])}
            />
            <span>Website / Domain</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.enrichBy.email}
              onChange={() => toggle(["enrichBy","email"])}
            />
            <span>Email</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.enrichBy.phone}
              onChange={() => toggle(["enrichBy","phone"])}
            />
            <span>Phone</span>
          </label>
        </div>
      </section>

      {/* Sources */}
      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.sources.web}
              onChange={() => toggle(["sources","web"])}
            />
            <span>Web Search</span>
          </label>

          <div>
            <div className="text-sm opacity-80 mb-1">Platforms</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.platforms.alibaba}
                  onChange={() => toggle(["sources","platforms","alibaba"])}
                />
                <span>Alibaba</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.platforms.madeInChina}
                  onChange={() => toggle(["sources","platforms","madeInChina"])}
                />
                <span>Made-in-China</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.platforms.indiamart}
                  onChange={() => toggle(["sources","platforms","indiamart"])}
                />
                <span>Indiamart</span>
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm opacity-80 mb-1">Socials</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.socials.linkedin}
                  onChange={() => toggle(["sources","socials","linkedin"])}
                />
                <span>LinkedIn</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.socials.facebook}
                  onChange={() => toggle(["sources","socials","facebook"])}
                />
                <span>Facebook</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cfg.sources.socials.instagram}
                  onChange={() => toggle(["sources","socials","instagram"])}
                />
                <span>Instagram</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Match policy */}
      <section>
        <h3 className="text-lg font-medium mb-2">Match policy</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.strictMatching}
              onChange={() => setCfg(p => ({ ...p, strictMatching: !p.strictMatching }))}
            />
            <span>Strict matching for company name</span>
          </label>
          <p className="text-xs opacity-70">
            Коли увімкнено — LinkedIn/платформи використовуються лише якщо назву компанії знайдено і вона достатньо збігається.
          </p>
        </div>
      </section>

      {/* Output fields (поки візуально) */}
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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("enrichment");

  return (
    <div className="flex h-full">
      <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          {(["profile","organization","users","billing","enrichment"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md ${activeTab === tab ? "bg-white/10 font-medium" : "hover:bg-white/5"}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === "enrichment" && <EnrichmentTab />}

        {activeTab === "profile" && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="text-sm opacity-80">Draft секція — заповнимо пізніше.</p>
          </section>
        )}
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
              <li>Історія оплат / керування через Stripe customer portal</li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
