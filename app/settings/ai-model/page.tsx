"use client";

import { useEffect, useState } from "react";

type AIModelSettings = {
  provider: "openai" | "anthropic" | "gemini";
  defaultModel: string;
};

const DEFAULT_SETTINGS: AIModelSettings = {
  provider: "openai",
  defaultModel: "",
};

export default function AIModelSettingsPage() {
  const [form, setForm] = useState<AIModelSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setOk(false);
      try {
        const r = await fetch("/api/settings/ai-model", { cache: "no-store" });
        let j: any = {};
        try {
          j = await r.json();
        } catch {}
        const settings: AIModelSettings = { ...DEFAULT_SETTINGS, ...(j?.settings || {}) };
        if (!cancelled) setForm(settings);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      const r = await fetch("/api/settings/ai-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      let j: any = {};
      try {
        j = await r.json();
      } catch {}
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
      <h2 className="text-xl font-semibold">AI Model Settings</h2>
      <p className="text-sm opacity-80">
        Configure the default AI provider and model for analysis. These settings will be used in Searches.
      </p>

      <div className="space-y-4">
        <label className="text-sm block">
          <div className="mb-1 opacity-70">Provider</div>
          <select
            className="input"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as any })}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>

        <label className="text-sm block">
          <div className="mb-1 opacity-70">Default Model (optional)</div>
          <input
            className="input"
            placeholder="e.g., gpt-4o-mini, claude-3-haiku, gemini-1.5-flash"
            value={form.defaultModel}
            onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
          />
          <div className="text-xs opacity-60 mt-1">
            Leave empty to use provider defaults. Temperature and other parameters use safe presets (temperature: 0-0.2, top_p: 1).
          </div>
        </label>
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
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border, #1f2937);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: var(--bg, #0b0b0d);
          color: var(--text, #e5e7eb);
          outline: none;
        }
      `}</style>
    </section>
  );
}
