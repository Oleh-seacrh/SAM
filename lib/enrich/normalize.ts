export const stripLegal = (s: string) =>
  s.replace(/\b(inc|llc|ltd|pvt|pte|gmbh|s\.r\.o\.|sro|ооо|тов|пп|jsc|sa|ag|kg|bv)\b\.?/gi, "").trim();

export function normalizeDomain(urlOrDomain: string): string | null {
  try {
    const u = new URL(urlOrDomain.includes("://") ? urlOrDomain : `https://${urlOrDomain}`);
    return u.hostname.replace(/^www\./, "");
  } catch { return urlOrDomain?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null; }
}

export function normalizeEmail(e: string) { return e.trim().toLowerCase(); }

export function normalizePhone(p: string) {
  const digits = p.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  return digits;
}
