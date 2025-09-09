export function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}

export function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  // мінімальна валідація
  return v.includes("@") ? v : null;
}
