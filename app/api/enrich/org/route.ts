// app/api/enrich/org/route.ts
import { NextRequest, NextResponse } from "next/server";
import { searchByName, searchByEmail, searchByPhone, WebCandidate } from "@/lib/enrich/web";
import { detectCountryLLM } from "@/lib/llmCountry";
import { findPlatformsByName, findSocialMedia, findPlatformsSimple } from "@/lib/enrich/platforms";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- utils ----------
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
      let score = 0;
      if (!isSocialHost(host)) score += 5; else score -= 5;
      if (!isMarketplace(host)) score += 2; else score -= 2;
      score += Math.max(0, 5 - (host.split(".").length - 2));
      const nh = String(nameHint || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").trim();
      const th = String(c.title || "").toLowerCase();
      if (nh && th.includes(nh)) score += 2;
      return { home, host, score };
    })
    .filter(Boolean) as Array<{ home: string; host: string; score: number }>;

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.home || null;
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { 
      cache: "no-store", 
      redirect: "follow", 
      signal: ctrl.signal as any,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,uk;q=0.8,ru;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      }
    });
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
function validatePhoneCandidate(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\+/g, "");
  
  // Must have 7-15 digits
  if (digits.length < 7 || digits.length > 15) return null;
  
  // Reject if all digits are the same
  if (/^(\d)\1+$/.test(digits)) return null;
  
  // Reject dates (8 digits starting with 20)
  if (digits.length === 8 && /^20\d{6}$/.test(digits)) return null;
  
  // Reject years
  if (digits.length === 4 && /^(19|20)\d{2}$/.test(digits)) return null;
  
  const hasPlus = raw.startsWith("+");
  return hasPlus ? `+${digits}` : digits;
}

function cleanPhoneRaw(text: string): string[] {
  const phones = new Map<string, number>(); // phone -> priority
  
  // Keep full text with HTML for better context extraction
  const fullText = text;
  const plainText = text.replace(/<[^>]+>/g, " ");
  
  // Priority 1: tel: links (highest - most reliable)
  const telLinks = /href=["']tel:([^"']+)["']/gi;
  for (const m of fullText.matchAll(telLinks)) {
    const validated = validatePhoneCandidate(m[1]);
    if (validated) phones.set(validated, (phones.get(validated) || 0) + 10);
  }
  
  // Priority 2: Extract from visible text near labels with more context
  // Look for patterns like "Call ... +44 (0) 1992 571 775" or "Phone: +44..."
  const labelPatternExtended = /(?:call|phone|tel|telephone|mobile|fax|contact|тел|телефон|моб)[^<>\d]{0,30}?(\+\d{1,3}[\s\-.()\d]{8,25})/gi;
  for (const m of plainText.matchAll(labelPatternExtended)) {
    const validated = validatePhoneCandidate(m[1]);
    if (validated) phones.set(validated, (phones.get(validated) || 0) + 9);
  }
  
  // Priority 3: International format with country code
  const intlPattern = /\+\d{1,3}[\s\-.()\d]{8,20}/g;
  for (const m of plainText.matchAll(intlPattern)) {
    const validated = validatePhoneCandidate(m[0]);
    if (validated) phones.set(validated, (phones.get(validated) || 0) + 7);
  }
  
  // Priority 4: Look in footer/header sections (common locations)
  const footerMatch = /<footer[^>]*>([\s\S]*?)<\/footer>/gi;
  const headerMatch = /<header[^>]*>([\s\S]*?)<\/header>/gi;
  
  for (const section of [...fullText.matchAll(footerMatch), ...fullText.matchAll(headerMatch)]) {
    const sectionText = section[1].replace(/<[^>]+>/g, " ");
    const phoneInSection = /\+\d{1,3}[\s\-.()\d]{8,20}/g;
    for (const m of sectionText.matchAll(phoneInSection)) {
      const validated = validatePhoneCandidate(m[0]);
      if (validated) phones.set(validated, (phones.get(validated) || 0) + 8);
    }
  }
  
  return Array.from(phones.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([phone]) => phone)
    .slice(0, 10);
}
function extractEmails(html: string): string[] {
  const out = new Set<string>();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const matches = html.match(re) || [];
  
  // Filter out common spam/placeholder emails
  const blacklist = [
    'example.com', 'test.com', 'domain.com', 'email.com', 
    'yourcompany.com', 'yourdomain.com', 'company.com',
    'noreply@', 'no-reply@', 'donotreply@', 'bounce@', 
    'mailer-daemon@', 'postmaster@', 'abuse@', 'spam@',
    'sentry.io', 'wixpress.com', 'godaddy.com', 'wordpress.com'
  ];
  
  for (const m of matches) {
    const lower = m.toLowerCase();
    const isBlacklisted = blacklist.some(b => lower.includes(b));
    if (!isBlacklisted) {
      out.add(lower);
    }
  }
  
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

    // trace structure
    const trace: any = {
      input: { name: name || "", email: emailIn || "", phone: phoneIn || "", domain: domainIn || "" },
      domainResolution: [] as Array<{ stage: string; result: "hit" | "miss"; value?: string }>,
      pages: [] as Array<{ url: string; ok: boolean; status?: number | string; bytes?: number }>,
      extracted: { emails: 0, phones: 0, socials: { linkedin: false, facebook: false }, name: false, country: false },
    };

    // 1) resolve domain
    let domain = normalizeDomainClient(domainIn);
    if (domain) trace.domainResolution.push({ stage: "input.domain", result: "hit", value: domain });
    else trace.domainResolution.push({ stage: "input.domain", result: "miss" });

    if (!domain) {
      const d = domainFromEmail(emailIn);
      if (d) {
        domain = d;
        trace.domainResolution.push({ stage: "from.email", result: "hit", value: domain });
      } else {
        trace.domainResolution.push({ stage: "from.email", result: "miss" });
      }
    }

    // Check if web search is enabled in settings
    const sql = getSql();
    const tenantId = await getTenantIdFromSession();
    let webSearchEnabled = true; // default
    
    try {
      const rows = await sql`select enrich_config from tenant_settings where tenant_id = ${tenantId} limit 1`;
      if (rows[0]?.enrich_config?.sources?.web !== undefined) {
        webSearchEnabled = rows[0].enrich_config.sources.web;
      }
    } catch {
      // Use default if settings not found
    }

    if (!domain && webSearchEnabled) {
      let candidates: WebCandidate[] = [];
      
      // Try 1: search by name (if provided)
      if (name) {
        candidates = await searchByName(name, null);
        trace.domainResolution.push({ stage: "searchByName", result: candidates.length ? "hit" : "miss", value: candidates.length ? `${candidates.length} results` : undefined });
      }
      
      // Try 2: search by email (if name search failed and email provided)
      if (!candidates?.length && emailIn) {
        candidates = await searchByEmail(emailIn);
        trace.domainResolution.push({ stage: "searchByEmail", result: candidates.length ? "hit" : "miss", value: candidates.length ? `${candidates.length} results` : undefined });
      }
      
      // Try 3: search by phone (if both name and email search failed and phone provided)
      if (!candidates?.length && phoneIn) {
        candidates = await searchByPhone(phoneIn);
        trace.domainResolution.push({ stage: "searchByPhone", result: candidates.length ? "hit" : "miss", value: candidates.length ? `${candidates.length} results` : undefined });
      }

      if (candidates?.length) {
        const home = pickHomepage(candidates, name);
        if (home) {
          domain = new URL(home).hostname.replace(/^www\./, "");
          trace.domainResolution.push({ stage: "homepage.pick", result: "hit", value: domain });
        } else {
          trace.domainResolution.push({ stage: "homepage.pick", result: "miss" });
        }
      }
    } else if (!domain && !webSearchEnabled) {
      trace.domainResolution.push({ stage: "web-search", result: "miss", value: "disabled in settings" });
    }

    if (!domain) {
      // not an error, soft return
      return NextResponse.json({ suggestions: [], reason: "domain_not_resolved" as const, trace }, { status: 200 });
    }

    // 2) fetch common pages - expanded list for better data extraction
    const origin = `https://${domain}/`;
    const paths = [
      "", // homepage (often has contact in footer)
      // About pages
      "about", "about-us", "about-company", "company", "company/about", 
      "о-нас", "про-нас", "о-компании", "about.html",
      // Contact pages (high priority for phones/emails)
      "contact", "contacts", "contact-us", "get-in-touch", "reach-us",
      "контакты", "контакти", "зв'язок", "contact.html",
      // Multi-language variants
      "en", "en/contact", "en/about", "en/about-us", "en/contact-us",
      "ua", "ua/contact", "ua/about", "ua/about-us",
      "ru", "ru/contact", "ru/about", "ru/about-us",
      "de/kontakt", "fr/contact", "es/contacto",
      // Footer/Header specific pages
      "footer", "header", "site-map", "sitemap"
    ];
    const pages: Array<{ url: string; html: string }> = [];
    for (const p of paths) {
      const url = p ? new URL(p, origin).toString() : origin;
      try {
        const res = await fetchWithTimeout(url, 8000);
        if (!res.ok) {
          trace.pages.push({ url, ok: false, status: res.status });
          continue;
        }
        const html = await res.text();
        trace.pages.push({ url, ok: true, status: res.status, bytes: html?.length || 0 });
        if (html && html.length) pages.push({ url, html });
      } catch {
        trace.pages.push({ url, ok: false, status: "error" });
      }
    }

    if (!pages.length) {
      return NextResponse.json({ suggestions: [], reason: "pages_unreachable" as const, trace }, { status: 200 });
    }

    // 3) parse
    const suggestions: Array<{ field: string; value: string; confidence?: number; source?: string }> = [];

    // domain (if inferred)
    if (domain && !normalizeDomainClient(domainIn)) {
      pushUnique(suggestions, { field: "domain", value: domain, confidence: 0.9, source: emailIn ? "email" : "web-search" });
    }

    // name
    let bestName: string | null = null;
    let nameSource: "jsonld" | "og" | "title" = "title";
    
    // Blacklist for invalid company names
    const invalidNames = [
      'contact', 'home', 'welcome', 'about', 'index', 'main',
      'untitled', 'default', 'page', 'site', 'website'
    ];
    
    for (const pg of pages) {
      const jsonLdName = extractJsonLdName(pg.html);
      const ogName = extractOG(pg.html, "title");
      const titleName = extractTitle(pg.html);
      
      const t = jsonLdName || ogName || titleName;
      if (jsonLdName) nameSource = "jsonld";
      else if (ogName) nameSource = "og";
      
      // Skip if name is too short or in blacklist
      if (t && t.length >= 3) {
        const normalized = t.toLowerCase().trim();
        const isInvalid = invalidNames.some(inv => normalized === inv || normalized.startsWith(inv + ' ') || normalized.endsWith(' ' + inv));
        
        if (!isInvalid && (!bestName || t.length < (bestName.length || 999))) {
          bestName = t;
        }
      }
    }
    
    if (bestName) {
      trace.extracted.name = true;
      // Higher confidence for structured data (JSON-LD), medium for OG, lower for title
      const confidence = nameSource === "jsonld" ? 0.9 : nameSource === "og" ? 0.8 : 0.7;
      pushUnique(suggestions, { field: "name", value: bestName, confidence });
      pushUnique(suggestions, { field: "company.displayName", value: bestName, confidence });
    }

    // emails
    const emailsAll = new Set<string>();
    for (const pg of pages) extractEmails(pg.html).forEach(e => emailsAll.add(e));
    const emails = Array.from(emailsAll);
    trace.extracted.emails = emails.length;

    const corp = emails.filter(e => e.endsWith(`@${domain}`));
    const generalPreferred = corp.find(e => /^(info|sales|contact|office|hello|support|enquiry|inquiry)@/i.test(e));
    if (generalPreferred) {
      pushUnique(suggestions, { field: "general_email", value: generalPreferred, confidence: 0.95 });
    } else if (corp.length > 0) {
      pushUnique(suggestions, { field: "general_email", value: corp[0], confidence: 0.8 });
    } else if (emails.length > 0) {
      pushUnique(suggestions, { field: "who.email", value: emails[0], confidence: 0.5 });
    }

    // phones
    const phonesAll = new Set<string>();
    for (const pg of pages) cleanPhoneRaw(pg.html).forEach(p => phonesAll.add(p));
    const phones = Array.from(phonesAll);
    trace.extracted.phones = phones.length;
    if (phones.length) {
      // Higher confidence for international format phones
      const confidence = phones[0].startsWith('+') ? 0.85 : 0.75;
      pushUnique(suggestions, { field: "contact_phone", value: phones[0], confidence });
    }

    // socials
    let linkedin_url: string | undefined;
    let facebook_url: string | undefined;
    for (const pg of pages) {
      const soc = extractSocials(pg.html);
      if (!linkedin_url && soc.linkedin) linkedin_url = soc.linkedin;
      if (!facebook_url && soc.facebook) facebook_url = soc.facebook;
    }
    if (linkedin_url) { trace.extracted.socials.linkedin = true; pushUnique(suggestions, { field: "linkedin_url", value: linkedin_url, confidence: 0.95 }); }
    if (facebook_url) { trace.extracted.socials.facebook = true; pushUnique(suggestions, { field: "facebook_url", value: facebook_url, confidence: 0.95 }); }

    // country detection using LLM
    try {
      // Remove all limits - use full HTML content for better accuracy
      const allText = pages.map(p => p.html).join(" ");
      const countryResult = await detectCountryLLM({
        text: allText,
        domain: domain || "",
        phones: phones,
      });
      
      if (countryResult?.iso2) {
        trace.extracted.country = true;
        pushUnique(suggestions, { 
          field: "country", 
          value: countryResult.iso2, 
          confidence: countryResult.confidence === "high" ? 0.9 : countryResult.confidence === "medium" ? 0.7 : 0.5 
        });
      }
    } catch (e: any) {
      console.warn("Country detection failed:", e?.message);
    }

    // ============================================================================
    // НЕЗАЛЕЖНИЙ пошук на платформах (Alibaba, LinkedIn, Facebook)
    // Виконується ЗАВЖДИ якщо є назва, незалежно від domain чи інших результатів
    // ============================================================================
    
    // Визначаємо назву для пошуку
    let platformSearchName = bestName || name;
    if (!platformSearchName && domain) {
      // Якщо немає назви, витягуємо з domain: "xraymedem.com" -> "Xraymedem"
      const domainParts = domain.split('.');
      if (domainParts[0]) {
        platformSearchName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
      }
    }
    
    console.log("[ENRICH] Platform search name:", platformSearchName);
    
    // Отримуємо settings для платформ
    let platformsEnabled = { alibaba: true, madeInChina: false, indiamart: false };
    try {
      const rows = await sql`select enrich_config from tenant_settings where tenant_id = ${tenantId} limit 1`;
      if (rows[0]?.enrich_config?.sources?.platforms) {
        platformsEnabled = rows[0].enrich_config.sources.platforms;
      }
    } catch {
      // Use defaults if settings not found
    }

    // ALIBABA, Made-in-China, IndiaMART пошук
    if (platformSearchName && (platformsEnabled.alibaba || platformsEnabled.madeInChina || platformsEnabled.indiamart)) {
      try {
        console.log("[ENRICH] Simple platform search:", {
          searchName: platformSearchName,
          platformsEnabled
        });
        
        // ПРОСТИЙ пошук через Google "Company Name + Platform"
        const simplePlatformResults = await findPlatformsSimple(
          platformSearchName, 
          platformsEnabled
        );
        
        console.log("[ENRICH] Simple platform results:", simplePlatformResults);
        
        trace.platforms = {
          searched: true,
          resultsCount: Object.keys(simplePlatformResults).filter(k => simplePlatformResults[k as keyof typeof simplePlatformResults]).length,
          enabled: platformsEnabled,
          simple: true
        };

        // Add platform URLs as suggestions (просто URLs, без парсингу)
        if (simplePlatformResults.alibaba) {
          pushUnique(suggestions, { 
            field: "alibaba_url", 
            value: simplePlatformResults.alibaba, 
            confidence: 0.8,
            source: "google-search"
          });
        }
        
        if (simplePlatformResults.madeInChina) {
          pushUnique(suggestions, { 
            field: "made_in_china_url", 
            value: simplePlatformResults.madeInChina, 
            confidence: 0.8,
            source: "google-search"
          });
        }
        
        if (simplePlatformResults.indiamart) {
          pushUnique(suggestions, { 
            field: "indiamart_url", 
            value: simplePlatformResults.indiamart, 
            confidence: 0.8,
            source: "google-search"
          });
        }
      } catch (e: any) {
        console.warn("Platform search failed:", e?.message);
        trace.platforms = { searched: false, error: e?.message };
      }
    } else {
      trace.platforms = { searched: false, reason: platformSearchName ? "platforms disabled" : "no search name" };
    }

    // LINKEDIN & FACEBOOK пошук (також незалежний)
    if (platformSearchName) {
      try {
        console.log("[ENRICH] Searching social media for:", platformSearchName);
        const socialResults = await findSocialMedia(platformSearchName, {
          email: emailIn || emails[0],
          domain: domain || undefined
        });

        trace.socialMedia = {
          searched: true,
          found: {
            linkedin: !!socialResults.linkedin,
            facebook: !!socialResults.facebook
          }
        };

        if (socialResults.linkedin) {
          pushUnique(suggestions, {
            field: "linkedin_url",
            value: socialResults.linkedin,
            confidence: 0.9,
            source: "social-search"
          });
        }

        if (socialResults.facebook) {
          pushUnique(suggestions, {
            field: "facebook_url",
            value: socialResults.facebook,
            confidence: 0.9,
            source: "social-search"
          });
        }
      } catch (e: any) {
        console.warn("Social media search failed:", e?.message);
        trace.socialMedia = { searched: false, error: e?.message };
      }
    }

    // 4) respond
    if (!suggestions.length) {
      return NextResponse.json({ suggestions: [], reason: "no_contacts_found" as const, trace }, { status: 200 });
    }
    return NextResponse.json({ suggestions, trace }, { status: 200 });

  } catch (e: any) {
    console.error("ENRICH ORG ERROR:", e?.message || e);
    return NextResponse.json({ suggestions: [], error: e?.message || "Internal error" }, { status: 500 });
  }
}
