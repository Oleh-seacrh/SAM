// app/api/enrich/org/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

/** обмежений fetch з таймаутом */
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

function pickBest<T>(arr: T[], score: (x: T) => number): T | null {
  if (!arr.length) return null;
  return arr
    .map(v => ({ v, s: score(v) }))
    .sort((a, b) => b.s - a.s)[0].v;
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
      const cand = Array.isArray(j) ? j : [j];
      for (const x of cand) {
        const name = x?.name || x?.legalName || x?.publisher?.name || x?.author?.name;
        if (name && typeof name === "string") return name.trim();
      }
    } catch {}
  }
  return null;
}
function extractEmails(html: string): string[] {
  const set = new Set<string>();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m;
  while ((m = re.exec(html))) set.add(m[0].toLowerCase());
  return [...set];
}
function cleanPhone(raw: string): string {
  // зберігаємо тільки + та цифри
  const only = raw.replace(/[^\d+]/g, "");
  const hasPlus = only.startsWith("+");
  const digits = only.replace(/\D/g, "");
  // валідний інтервал довжин
  if (digits.length < 7 || digits.length > 15) return "";
  return (hasPlus ? "+" : "") + digits;
}

function extractPhones(html: string): string[] {
  const set = new Set<string>();
  // шукаємо по «плоскому» тексту без тегів
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const re = /\+?\d[\d()\s-]{6,}\d/g;
  let m;
  while ((m = re.exec(text))) {
    const cleaned = cleanPhone(m[0]);
    if (cleaned) set.add(cleaned);
  }
  return [...set];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const domainRaw: string | null = body?.domain ?? null;
    const nameHint: string | null = body?.name ?? null;
    const emailHint: string | null = body?.email ?? null;

    const suggestions: { field: string; value: string; confidence?: number; source?: string }[] = [];
    if (!domainRaw) return NextResponse.json({ suggestions });

    const domain = domainRaw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
    const bases = [`https://${domain}/`, `https://${domain}/about`, `https://${domain}/contact`, `https://${domain}/contacts`];

    const pages: { url: string; html: string }[] = [];
    for (const u of bases) {
      try {
        const html = await fetchWithTimeout(u, 5500);
        if (html && html.length) pages.push({ url: u, html });
      } catch {}
    }
    if (!pages.length) return NextResponse.json({ suggestions });

    // ---- NAME
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
      suggestions.push({ field: "name", value: bestName.val, confidence: bestName.conf, source: bestName.src });
      // для Collect (щоб було корисно і там)
      suggestions.push({ field: "company.displayName", value: bestName.val, confidence: bestName.conf, source: bestName.src });
    }

    // ---- EMAILS
    const emails: { val: string; src: string }[] = [];
    for (const p of pages) {
      for (const e of extractEmails(p.html)) emails.push({ val: e, src: p.url });
    }
    const dedupEmails = [...new Set(emails.map(e => e.val))];
    if (dedupEmails.length) {
      const corp = dedupEmails.find(e => e.endsWith(`@${domain}`)) || dedupEmails[0];
      suggestions.push({ field: "general_email", value: corp, confidence: 0.85, source: emails.find(e => e.val === corp)?.src });
      suggestions.push({ field: "contact_email", value: corp, confidence: 0.7, source: emails.find(e => e.val === corp)?.src });
      // для Collect
      suggestions.push({ field: "who.email", value: corp, confidence: 0.7, source: emails.find(e => e.val === corp)?.src });
    }

    // ---- PHONES
    const phones: { val: string; src: string }[] = [];
    for (const p of pages) {
      for (const ph of extractPhones(p.html)) phones.push({ val: ph, src: p.url });
    }
    const dedupPhones = [...new Set(phones.map(p => p.val))];
    if (dedupPhones.length) {
      const ph = dedupPhones[0];
      suggestions.push({ field: "contact_phone", value: ph, confidence: 0.6, source: phones.find(x => x.val === ph)?.src });
      // для Collect
      suggestions.push({ field: "who.phone", value: ph, confidence: 0.6, source: phones.find(x => x.val === ph)?.src });
    }

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    return NextResponse.json({ suggestions: [], error: e?.message ?? "enrich failed" }, { status: 200 });
  }
}
