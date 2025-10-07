"use client";
import { useEffect, useState } from "react";

export type PromptItem = {
  id: string;
  name: string;
  text: string;
  provider: "openai" | "anthropic" | "gemini";
  model?: string | null;
  created_at?: string;
  createdAt?: number; // for backward compat with localStorage
};

const KEY_LAST = "sam.prompts.lastId";

export function usePrompts() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [lastUsedId, setLastUsedIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load prompts from API on mount
  useEffect(() => {
    fetchPrompts();
  }, []);

  async function fetchPrompts() {
    try {
      const r = await fetch("/api/prompts");
      if (!r.ok) throw new Error("Failed to fetch prompts");
      const data = await r.json();
      setPrompts(data.prompts || []);
      setLastUsedIdState(localStorage.getItem(KEY_LAST));
    } catch (e) {
      console.warn("Failed to load prompts:", e);
    } finally {
      setLoading(false);
    }
  }

  function setLastUsedId(id: string | null) {
    setLastUsedIdState(id);
    if (id) localStorage.setItem(KEY_LAST, id);
    else localStorage.removeItem(KEY_LAST);
  }

  async function add(p: {
    name: string;
    text: string;
    provider: "openai" | "anthropic" | "gemini";
    model?: string;
  }) {
    try {
      const r = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          text: p.text,
          provider: p.provider,
          model: p.model || null,
        }),
      });
      if (!r.ok) throw new Error("Failed to save prompt");
      const data = await r.json();
      const newPrompt = data.prompt;
      
      // Update local state
      setPrompts([newPrompt, ...prompts]);
      setLastUsedId(newPrompt.id);
    } catch (e) {
      console.error("Failed to save prompt:", e);
      throw e;
    }
  }

  async function remove(id: string) {
    try {
      const r = await fetch(`/api/prompts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Failed to delete prompt");
      
      // Update local state
      const list = prompts.filter(p => p.id !== id);
      setPrompts(list);
      if (lastUsedId === id) setLastUsedId(null);
    } catch (e) {
      console.error("Failed to delete prompt:", e);
      throw e;
    }
  }

  return { prompts, add, remove, lastUsedId, setLastUsedId, loading };
}
