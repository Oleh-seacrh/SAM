"use client";

import React, { useState } from "react";

type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";

/** Keep as const to avoid JSX parsing issues */
const EnrichmentTab: React.FC = () => {
  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Enrichment Settings</h2>

      {/* Inputs: що дозволено подавати в універсальний пошук */}
      <section>
        <h3 className="text-lg font-medium mb-2">Inputs</h3>
        <p className="text-sm opacity-80 mb-3">
          Обери, які типи даних SAM приймає на вхід для авто-ентрічу. Пайплайн один і той самий для всіх.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Website / Domain</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Email</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" /> <span>Phone</span>
          </label>
        </div>
      </section>

      {/* Sources: де шукати (увімк/вимк) */}
      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Web Search</span>
          </label>

          <div>
            <div className="text-sm opacity-80 mb-1">Platforms</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked /> <span>Alibaba</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" /> <span>Made-in-China</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" /> <span>Indiamart</span>
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm opacity-80 mb-1">Socials</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked /> <span>LinkedIn</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" /> <span>Facebook</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" /> <span>Instagram</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Match policy: одна проста опція */}
      <section>
        <h3 className="text-lg font-medium mb-2">Match policy</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Strict matching for company name</span>
          </label>
          <p className="text-xs opacity-70">
            Коли увімкнено — LinkedIn/платформи використовуються лише якщо назву компанії знайдено і вона достатньо збігається.
          </p>
        </div>
      </section>

      {/* Output fields (як у тебе було) */}
      <section>
        <h3 className="text-lg font-medium mb-2">Output fields</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Company Name</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Country (ISO-2)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Industry / Category</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Contacts (email/phone/person)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" /> <span>Size (employees)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" /> <span>Tags (Medical / NDT / Other)</span>
          </label>
        </div>
      </section>
    </div>
  );
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("enrichment");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          {(["profile", "organization", "users", "billing", "enrichment"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3 py-2 rounded-md ${
                activeTab === tab ? "bg-white/10 font-medium" : "hover:bg-white/5"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
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
