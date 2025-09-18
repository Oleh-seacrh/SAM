"use client";

import { useState } from "react";

type Tab = "profile" | "organization" | "users" | "billing" | "enrichment";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("enrichment");

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/10 bg-[var(--card)]">
        <div className="h-14 flex items-center px-4 text-lg font-semibold">Settings</div>
        <nav className="px-2 pb-4 space-y-1">
          {(["profile","organization","users","billing","enrichment"] as Tab[]).map((tab) => (
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
              <li>Кнопка Upgrade → редірект на сайт-візитку</li>
              <li>Історія оплат / керування через Stripe customer portal</li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function EnrichmentTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Enrichment Settings</h2>

      {/* Enrich by */}
      <section>
        <h3 className="text-lg font-medium mb-2">Enrich by</h3>
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

      {/* Sources */}
      <section>
        <h3 className="text-lg font-medium mb-2">Sources</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> <span>Web Search</span>
          </label>
          <div className="mt-2">
            <div className="text-sm opacity-80 mb-1">Platforms</div>
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
          <div classNam
