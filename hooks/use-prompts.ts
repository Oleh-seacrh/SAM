"use client";
import { useEffect, useMemo, useState } from "react";

export type PromptItem = {
  id: string;
  name: string;
  text: string;
  provider: "openai" | "anthropic" | "gemini";
  model?: string;
  createdAt: number;
};

const KEY = "sam.prompts.v1";
const KEY_LAST = "sam.prompts.lastId";

function load(): PromptItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as PromptItem[] : [];
  } catch { return []; }
}
function save(list: PromptItem[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [lastUsedId, setLastUsedIdState] = useState<string | null>(null);

  useEffect(() => {
    const list = load();
    setPrompts(list);
    setLastUsedIdState(localStorage.getItem(KEY_LAST));
  }, []);

  function setLastUsedId(id: string | null) {
    setLastUsedIdState(id);
    if (id) localStorage.setItem(KEY_LAST, id);
    else localStorage.removeItem(KEY_LAST);
  }

  function add(p: {name:string;text:string;provider:"openai"|"anthropic"|"gemini";model?:string}) {
    const item: PromptItem = {
      id: crypto.randomUUID(),
      name: p.name,
      text: p.text,
      provider: p.provider,
      model: p.model,
      createdAt: Date.now(),
    };
    const list = [item, ...prompts];
    setPrompts(list);
    save(list);
    setLastUsedId(item.id);
  }

  function remove(id: string) {
    const list = prompts.filter(p => p.id !== id);
    setPrompts(list);
    save(list);
    if (lastUsedId === id) setLastUsedId(null);
  }

  return { prompts, add, remove, lastUsedId, setLastUsedId };
}
