// app/api/enrich/org/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

/** fetch з таймаутом */
async function fetchWithTimeout(url: string, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" as any });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// helpers
function pickBest<T>(arr: T[], score: (x: T) => number): T | null {
  if (!arr.length) return null;
  return arr.map(v => ({ v, s: score(v) })).sort((a, b) => b.s - a.s)[0].v;
}
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
function extractOG(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
function extractJsonLdName(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      const arr = Array.isArray(j) ? j : [j];
      for (const x of arr) {
        const name = x?.name || x?.legalName || x?.publisher?.name || x?.author?.name;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
    } catch {}
  }
  return null;
}
function extractEmails(html: string): string[] {
  const set = new Set<string>();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) set.add(m[0].toLowerCase());
  return [...set];
}
function cleanPhone(raw: string): string {
  const only = raw.replace(/[^\d+]/g, "");
  const hasPlus = only.startsWith("+");
  const digits = only.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return (hasPlus ? "+" : "") + digits;
}
function extractPhones(html: string): string[] {
  const set = new Set<string>();
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const re = /\+?\d[\d()\s-]{6,}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const cleaned = cleanPhone(m[0]);
    if (cleaned) set.add(cleaned);
  }
  return [...set];
}
// Соцмережі
function firstMatch(re: RegExp, html: string): string | null {
  const m = re.exec(html);
  return m ? m[1] : null;
}
function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function extractSocials(html: string): { linkedin?: string; facebook?: string } {
  const li = firstMatch(/href=["']([^"']*linkedin\.com\/(company|school|showcase)\/[^"']+)["']/i, html);
  const fb = firstMatch(/href=["']([^"']*facebook\.com\/[^"']+)["']/i, html);
  return { linkedin: normalizeUrl(li) || undefined, facebook: normalizeUrl(fb) || undefined };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const domainRaw: string | null = body?.domain ?? null;
    const nameHint: string | null = body?.name ?? null;
    const emailHint: string | null = body?.email ?? null;

    const suggestions: { field: string; value: string; confidence?: number; source?: string }[] = [];
    const seen = new Set<string>(); // dedupe by field+value

    function pushUnique(s: { field: string; value: string; confidence?: number; source?: string }) {
      const key = `${s.field}::${String(s.value).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push(s);
      }
    }

    // reverse-lite: якщо домен не передано, але є email → беремо домен з email
    let effectiveDomain = domainRaw;
    if (!effectiveDomain && emailHint && typeof emailHint === "string") {
      const m = emailHint.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
      if (m) {
        effectiveDomain = m[1];
        pushUnique({ field: "domain", value: effectiveDomain, confidence: 0.9, source: "email" });
      }
    }

    if (!effectiveDomain) {
      // Нічого зберігати — без домену сайту цей MVP нічого не скрапить
      return NextResponse.json({ suggestions });
    }

    const domain = String(effectiveDomain)
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0];

    const urls = [
      `https://${domain}/`,
      `https://${domain}/about`,
      `https://${domain}/contact`,
      `https://${domain}/contacts`,
    ];

    const pages: { url: string; html: string }[] = [];
    for (const u of urls) {
      try {
        const html = await fetchWithTimeout(u, 5500);
        if (html?.length) pages.push({ url: u, html });
      } catch {}
    }
    if (!pages.length) return NextResponse.json({ suggestions });

    // NAME
    const names: { val: string; src: string; conf: number }[] = [];
    for (const p of pages) {
      const n1 = extractJsonLdName(p.html);
      if (n1) names.push({ val: n1, src: p.url, conf: 0.95 });
      const n2 = extractOG(p.html, "og:site_name");
      if (n2) names.push({ val: n2, src: p.url, conf: 0.8 });
      const n3 = extractTitle(p.html);
      if (n3) names.push({ val: n3, src: p.url, conf: 0.6 });
    }
    const bestName = pickBest(names, x => x.conf + (nameHint && x.val.includes(nameHint) ? 0.1 : 0));
    if (bestName) {
      pushUnique({ field: "name", value: bestName.val, confidence: bestName.conf, source: bestName.src });
      // не дублюємо company.displayName, якщо те саме значення (ключ у seen не дасть продублювати)
      pushUnique({ field: "company.displayName", value: bestName.val, confidence: bestName.conf, source: bestName.src });
    }

    // EMAILS
    const emails: { val: string; src: string }[] = [];
    for (const p of pages) {
      for (const e of extractEmails(p.html)) emails.push({ val: e, src: p.url });
    }
    const dedupEmails = [...new Set(emails.map(e => e.val))];
    if (dedupEmails.length) {
      const corp = dedupEmails.find(e => e.endsWith(`@${domain}`)) || dedupEmails[0];
      const corpSrc = emails.find(e => e.val === corp)?.src;
      pushUnique({ field: "general_email", value: corp, confidence: 0.85, source: corpSrc });
      pushUnique({ field: "contact_email", value: corp, confidence: 0.70, source: corpSrc });
      pushUnique({ field: "who.email", value: corp, confidence: 0.70, source: corpSrc });
    }

    // PHONES
    const phones: { val: string; src: string }[] = [];
    for (const p of pages) {
      for (const ph of extractPhones(p.html)) phones.push({ val: ph, src: p.url });
    }
    const dedupPhones = [...new Set(phones.map(p => p.val))];
    if (dedupPhones.length) {
      const ph = dedupPhones[0];
      const phSrc = phones.find(x => x.val === ph)?.src;
      pushUnique({ field: "contact_phone", value: ph, confidence: 0.60, source: phSrc });
      pushUnique({ field: "who.phone", value: ph, confidence: 0.60, source: phSrc });
    }

    // SOCIALS
    for (const p of pages) {
      const socials = extractSocials(p.html);
      if (socials.linkedin) {
        pushUnique({ field: "linkedin_url", value: socials.linkedin, confidence: 0.9, source: p.url });
      }
      if (socials.facebook) {
        pushUnique({ field: "facebook_url", value: socials.facebook, confidence: 0.8, source: p.url });
      }
    }

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    // важливо: повертати 500, а не 200 з error
    return NextResponse.json({ suggestions: [], error: e?.message ?? "enrich failed" }, { status: 500 });
  }
}
