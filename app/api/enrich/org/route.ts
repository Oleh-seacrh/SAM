// app/api/enrich/org/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchByName, searchByEmail, searchByPhone, WebCandidate } from "@/lib/enrich/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- утиліти ----------
function normalizeDomainClient(raw?: string | null): string | null {
  if (!raw) return null;
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
function domainFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const m = String(email).toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) return null;
  const host = m[1].replace(/^www\./, "");
  // фільтр публічних поштовиків
  if (/^(gmail|yahoo|hotmail|outlook|proton|icloud)\./i.test(host)) return null;
  return host;
}
function isSocialHost(host: string): boolean {
  return /(linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com)/i.test(host);
}
function isMarketplace(host: string): boolean {
  return /(alibaba\.com|indiamart\.com|made-in-china\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|crunchbase\.com)/i.test(host);
}
function toHomepage(u: string): string | null {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.hostname}/`;
  } catch { return null; }
}
function pickHomepage(cands: WebCandidate[], nameHint?: string | null) {
  const scored = cands
    .map(c => {
      const home = c.homepage || toHomepage(c.link);
      if (!home) return null;
      const host = new URL(home).hostname;
      // базовий скоринг
      let score = 0;
      if (!isSocialHost(host)) score += 5; else score -= 5;
      if (!isMarketplace(host)) score += 2; else score -= 2;
      // коротші хости краще
      score += Math.max(0, 5 - (host.split(".").length - 2));
      // евристика збігу назви (дуже проста)
      const nh = String(nameHint || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").trim();
      const th = String(c.title || "").toLowerCase();
      if (nh && th.includes(nh)) score += 2;
      return { home, host, score, link: c.link, title: c.title };
    })
    .filter(Boolean) as Array<{ home: string; host: string; score: number; link: string; title: string }>;

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.home || null;
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", redirect: "follow", signal: ctrl.signal as any });
  } finally {
    clearTimeout(t);
  }
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return m ? m[1].trim() : null;
}
function extractJsonLdName(html: string): string | null {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const s of scripts) {
    try {
      const obj = JSON.parse(s[1]);
      if (obj?.name && typeof obj.name === "string") return obj.name.trim();
      if (Array.isArray(obj)) {
        for (const it of obj) {
          if (it?.name && typeof it.name === "string") return it.name.trim();
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}
function extractOG(html: string, prop: string): string | null {
  const re = new RegExp(`<meta\\s+(?:property|name)=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}
function cleanPhoneRaw(text: string): string[] {
  const phones = new Set<string>();
  const body = text.replace(/<[^>]+>/g, " ");
  const re = /\+?\d[\d()\s\-]{6,}\d/g;
  const matches = body.match(re) || [];
  for (const m of matches) {
    const digits = m.replace(/[^\d+]/g, "");
    const hasPlus = digits.startsWith("+");
    const only = digits.replace(/\D/g, "");
    if (only.length >= 7 && only.length <= 17) {
      phones.add((hasPlus ? "+" : "") + only);
    }
  }
  return Array.from(phones);
}
function extractEmails(html: string): string[] {
  const out = new Set<string>();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const matches = html.match(re) || [];
  for (const m of matches) out.add(m.toLowerCase());
  return Array.from(out);
}
function extractSocials(html: string): { linkedin?: string; facebook?: string } {
  const socials: { linkedin?: string; facebook?: string } = {};
  const ln = html.match(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|school|showcase)\/[a-z0-9._%-]+/gi);
  if (ln?.length) socials.linkedin = new URL(ln[0]).toString();
  const fb = html.match(/https?:\/\/(?:[a-z]+\.)?facebook\.com\/[a-z0-9._%-]+/gi);
  if (fb?.length) socials.facebook = new URL(fb[0]).toString();
  return socials;
}

function pushUnique<T extends { field: string; value: string }>(arr: T[], item: T) {
  if (!item.value) return;
  const key = `${item.field}:::${item.value}`;
  const exists = arr.some(s => `${s.field}:::${s.value}` === key);
  if (!exists) arr.push(item);
}

// ---------- handler ----------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId: string | null = body?.orgId ?? null;
    const name: string | null = body?.name ?? null;
    const country: string | null = body?.country ?? null;
    const emailIn: string | null = body?.email ?? null;
    const domainIn: string | null = body?.domain ?? null;
    const phoneIn: string | null = body?.phone ?? null;

    // 1) Визначаємо domain
    let domain = normalizeDomainClient(domainIn);
    let reason: "no_domain_input" | "domain_not_resolved" | "pages_unreachable" | "no_contacts_found" | undefined;

    if (!domain) {
      // з email
      domain = domainFromEmail(emailIn);
    }

    if (!domain) {
      // web search: name → email → phone
      let candidates: WebCandidate[] = [];
      if (name) candidates = await searchByName(name, country);
      if (!candidates?.length && emailIn) candidates = await searchByEmail(emailIn);
      if (!candidates?.length && phoneIn) candidates = await searchByPhone(phoneIn);

      if (!candidates?.length) {
        if (!name && !emailIn && !phoneIn) {
          return NextResponse.json({ suggestions: [], reason: "no_domain_input" as const }, { status: 200 });
        }
        reason = "domain_not_resolved";
      } else {
        // вибираємо homepage
        const home = pickHomepage(candidates, name);
        if (home) {
          domain = new URL(home).hostname.replace(/^www\./, "");
        } else {
          reason = "domain_not_resolved";
        }
      }
    }

    if (!domain) {
      return NextResponse.json({ suggestions: [], reason: reason || "domain_not_resolved" }, { status: 200 });
    }

    // 2) Фетчим сторінки сайту
    const origin = `https://${domain}/`;
    const paths = [
      "", "about", "about-us", "company", "company/about",
      "contact", "contacts", "en/contact", "en/about", "ua/contact"
    ];
    const pages: Array<{ url: string; html: string }> = [];
    for (const p of paths) {
      try {
        const url = p ? new URL(p, origin).toString() : origin;
        const res = await fetchWithTimeout(url, 8000);
        if (!res.ok) continue;
        const html = await res.text();
        if (html && html.length) pages.push({ url, html });
      } catch { /* ignore */ }
    }

    if (!pages.length) {
      return NextResponse.json({ suggestions: [], reason: "pages_unreachable" as const }, { status: 200 });
    }

    // 3) Парсимо
    const suggestions: Array<{ field: string; value: string; confidence?: number; source?: string }> = [];
    // домен (якщо прийшов із email, підкажемо з джерелом)
    if (domain && !normalizeDomainClient(domainIn)) {
      pushUnique(suggestions, { field: "domain", value: domain, confidence: 0.9, source: emailIn ? "email" : "web-search" });
    }

    // Назва (title / og:title / JSON-LD)
    let bestName: string | null = null;
    for (const pg of pages) {
      const t = extractJsonLdName(pg.html) || extractOG(pg.html, "title") || extractTitle(pg.html);
      if (t && (!bestName || t.length < (bestName.length || 999))) bestName = t;
    }
    if (bestName) {
      pushUnique(suggestions, { field: "name", value: bestName, confidence: 0.7 });
      pushUnique(suggestions, { field: "company.displayName", value: bestName, confidence: 0.7 });
    }

    // Емейли
    const emailsAll = new Set<string>();
    for (const pg of pages) extractEmails(pg.html).forEach(e => emailsAll.add(e));
    const emails = Array.from(emailsAll);
    const corp = emails.filter(e => e.endsWith(`@${domain}`));
    const generalPreferred = corp.find(e => /^(info|sales|contact|office|hello|support)@/i.test(e)) || corp[0];
    if (generalPreferred) {
      pushUnique(suggestions, { field: "general_email", value: generalPreferred, confidence: 0.9 });
    } else if (corp[0]) {
      pushUnique(suggestions, { field: "general_email", value: corp[0], confidence: 0.7 });
    } else if (emails[0]) {
      // не корпоративний, але краще, ніж нічого — у UI це може бути відфільтровано
      pushUnique(suggestions, { field: "who.email", value: emails[0], confidence: 0.4 });
    }

    // Телефони
    const phonesAll = new Set<string>();
    for (const pg of pages) cleanPhoneRaw(pg.html).forEach(p => phonesAll.add(p));
    const phones = Array.from(phonesAll);
    if (phones.length) {
      // персональний в UI не перезаписуємо; все одно повернемо як contact_phone (він там захищений)
      pushUnique(suggestions, { field: "contact_phone", value: phones[0], confidence: 0.6 });
    }

    // Соцмережі
    let linkedin_url: string | undefined;
    let facebook_url: string | undefined;
    for (const pg of pages) {
      const soc = extractSocials(pg.html);
      if (!linkedin_url && soc.linkedin) linkedin_url = soc.linkedin;
      if (!facebook_url && soc.facebook) facebook_url = soc.facebook;
    }
    if (linkedin_url) pushUnique(suggestions, { field: "linkedin_url", value: linkedin_url, confidence: 0.8 });
    if (facebook_url) pushUnique(suggestions, { field: "facebook_url", value: facebook_url, confidence: 0.8 });

    // 4) Фінальна відповідь
    if (!suggestions.length) {
      return NextResponse.json({ suggestions: [], reason: "no_contacts_found" as const }, { status: 200 });
    }
    return NextResponse.json({ suggestions }, { status: 200 });

  } catch (e: any) {
    console.error("ENRICH ORG ERROR:", e?.message || e);
    return NextResponse.json({ suggestions: [], error: e?.message || "Internal error" }, { status: 500 });
  }
}
