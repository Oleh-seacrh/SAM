"use client";
import { useEffect, useState } from "react";

export type SelfProfile = {
  name: string;
  company: string;
  email: string;
  phone: string;
  domain: string; // для розрізнення своїх доменів у листах
};

const KEY = "sam:self:session";

const empty: SelfProfile = { name: "", company: "", email: "", phone: "", domain: "" };

export function useSelfProfile() {
  const [self, setSelf] = useState<SelfProfile>(empty);

  // завантажити з sessionStorage при першому рендері
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setSelf(JSON.parse(raw));
    } catch (_) {}
  }, []);

  // зберігати кожну зміну у sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(self));
    } catch (_) {}
  }, [self]);

  function reset() {
    setSelf(empty);
    try { sessionStorage.removeItem(KEY); } catch (_) {}
  }

  return { self, setSelf, reset };
}
