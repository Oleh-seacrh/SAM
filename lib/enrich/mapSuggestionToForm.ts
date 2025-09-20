// Shared utility for mapping enrichment suggestions to form fields
// Extracted from OpenOrganizationModal to be used consistently across components

export type SuggestionMapping<T = any> = {
  key?: keyof T;
  val?: string;
} | null;

export interface Suggestion {
  field: string;
  value: string;
  confidence?: number;
  source?: string;
}

// Form interface that represents the structure we're mapping to
export interface FormLike {
  domain?: string;
  name?: string;
  general_email?: string;
  contact_email?: string;
  contact_phone?: string;
  [key: string]: any; // Allow additional fields
}

// Utility functions for validation and normalization
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizePhone(v: string): string | null {
  const only = v.replace(/[^\d+]/g, "");
  const hasPlus = only.startsWith("+");
  const digits = only.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (hasPlus ? "+" : "") + digits;
}

function normalizeDomainClient(raw: string): string | null {
  try {
    let v = String(raw).trim().toLowerCase();
    if (!v) return null;
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
    else v = v.split("/")[0];
    return v.replace(/^www\./, "");
  } catch {
    const s = String(raw).trim().toLowerCase();
    return s ? s.replace(/^www\./, "") : null;
  }
}

/**
 * Maps a suggestion to a form field, handling field name mappings and value normalization
 */
export function mapSuggestionToForm<T extends FormLike>(
  s: Suggestion,
  current: T
): SuggestionMapping<T> {
  const field = s.field;
  const value = String(s.value || "").trim();
  const domain = (current.domain || "").toLowerCase();

  if (field === "name" || field === "company.displayName") {
    return { key: "name" as keyof T, val: value };
  }
  
  if (field === "domain") {
    const d = normalizeDomainClient(value);
    if (d) return { key: "domain" as keyof T, val: d };
    return null;
  }

  if (field === "general_email" && isEmail(value)) {
    return { key: "general_email" as keyof T, val: value.toLowerCase() };
  }

  if (field === "contact_email" && isEmail(value)) {
    if (!current.contact_email) return { key: "contact_email" as keyof T, val: value.toLowerCase() };
    return null; // не перезаписуємо персональний
  }

  if (field === "who.email" && isEmail(value)) {
    if (domain && value.toLowerCase().endsWith("@" + domain)) {
      return { key: "general_email" as keyof T, val: value.toLowerCase() };
    }
    return null; // не корпоративний → ігноруємо
  }

  if (field === "contact_phone") {
    const p = normalizePhone(value);
    if (p && !current.contact_phone) return { key: "contact_phone" as keyof T, val: p };
    return null; // не перезаписуємо персональний
  }

  if (field === "who.phone") return null; // ніколи не пишемо

  return null;
}

/**
 * Checks if a suggestion can be applied to the current form
 */
export function canApplySuggestion<T extends FormLike>(
  s: Suggestion,
  current: T
): boolean {
  const m = mapSuggestionToForm(s, current);
  return !!(m && m.key && m.val != null);
}

/**
 * Checks if a suggestion should be pre-checked (can be applied and target field is empty)
 */
export function shouldPreCheckSuggestion<T extends FormLike>(
  s: Suggestion,
  current: T
): boolean {
  const m = mapSuggestionToForm(s, current);
  if (!m?.key || m.val == null) return false;
  
  // Only pre-check if the target field is currently empty
  const currentValue = current[m.key];
  return !currentValue || String(currentValue).trim() === "";
}