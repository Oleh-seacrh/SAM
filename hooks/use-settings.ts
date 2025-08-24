"use client";
import { useEffect, useState } from "react";

export type Provider = "openai" | "anthropic" | "gemini";
export type Settings = {
  lastQuery?: string;
  lastStart?: number;
  lastNum?: number;
  lastProvider?: Provider;
  lastModel?: string;
  lastPrompt?: string;
  autoRunLastSearch?: boolean;
};

const STORAGE_KEY = "sam_settings_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSettings(safeParse<Settings>(localStorage.getItem(STORAGE_KEY), { autoRunLastSearch: true }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const setLastSearch = (q: string, start: number, num: number) =>
    setSettings(s => ({ ...s, lastQuery: q, lastStart: start, lastNum: num }));

  const setLLM = (provider: Provider, model: string | undefined, prompt: string) =>
    setSettings(s => ({ ...s, lastProvider: provider, lastModel: model, lastPrompt: prompt }));

  const setAutoRun = (on: boolean) =>
    setSettings(s => ({ ...s, autoRunLastSearch: on }));

  return { settings, setSettings, setLastSearch, setLLM, setAutoRun };
}
