import { NextResponse } from "next/server";
import { getDefaultEnrichConfig, EnrichConfig } from "@/lib/enrich/config";
import { normalizeDomain, normalizeEmail, normalizePhone } from "@/lib/enrich/normalize";
import { fetchSite } from "@/lib/enrich/site";
import { searchWeb } from "@/lib/enrich/web";
import { findLinkedInCompanyByName } from "@/lib/enrich/linkedin";
import { findPlatformsByName } from "@/lib/enrich/platforms";
import { nameSimilarity } from "@/lib/enrich/matching";
import { db } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

type InputType = "domain"|"email"|"phone"|"name";
type EnrichmentResult = {
  organization: {
    name?: string; domain?: string; country_iso2?: string;
    industry?: string; size?: string; emails?: string[]; phones?: string[];
    tags?: string[]; source_primary?: string;
  };
  fields_meta: Record<string, { value?: any; source?: string; confidence?: number }>;
  trace: string[];
  status: "enriched"|"partial"|"contact-only"|"needs_review";
};

export async function POST(req: Request) {
  const tenantId = await getTenantIdFromSession();
  const body = await req.json() as { input: string; input_type?: InputType };
  const raw = (body.input || "").trim();

  // 1) Завантажити конфіг
  const row = await db.query("select enrich_config from tenant_settings where tenant_id = $1", [tenantId]);
  const cfg: EnrichConfig = row?.rows?.[0]?.enrich_config ?? getDefaultEnrichConfig();

  // 2) Нормалізація
  let domain = body.input_type === "domain" ? normalizeDomain(raw) : null;
  let email  = body.input_type === "email"  ? normalizeEmail(raw)  : null;
  let phone  = body.input_type === "phone"  ? normalizePhone(raw)  : null;
  let name   = body.input_type === "name"   ? raw : null;

  // Якщо не вказано тип — пробуємо здогадатися
  if (!domain && raw.includes(".")) domain = normalizeDomain(raw);
  if (!email && raw.includes("@")) email = normalizeEmail(raw);
  if (!phone && raw.startsWith("+")) phone = normalizePhone(raw);

  const trace: string[] = [];
  const meta: EnrichmentResult["fields_meta"] = {};

  // 3) Етап 0 — знайти назву (Name Discovery)
  let companyName: string | undefined = name ?? undefined;

  // 3a) Якщо є domain і дозволено website — беремо зі сайту
  if (!companyName && cfg.enrichBy.website && domain) {
    trace.push(`site: fetch ${domain}`);
    const site = await fetchSite(domain, cfg.perSourceTimeoutMs.site);
    if (site?.companyName) {
      companyName = site.companyName; meta["name"] = { value: companyName, source: "site", confidence: 0.9 };
    }
    if (!email && site?.emails?.length) meta["emails"] = { value: site.emails, source: "site", confidence: 0.9 };
    if (!phone && site?.phones?.length) meta["phones"] = { value: site.phones, source: "site", confidence: 0.9 };
  }

  // 3b) Якщо email гуглівський/аутлук — reverse пошук
  if (!companyName && cfg.enrichBy.email && email && /@(gmail|yahoo|outlook)\./.test(email)) {
    trace.push(`web: reverse by email "${email}"`);
    const sn = await searchWeb(`"${email}"`, cfg.perSourceTimeoutMs.web);
    // TODO: витягнути кандидати назв/сайтів зі сніпетів
  }

  // 3c) Якщо phone — reverse пошук
  if (!companyName && cfg.enrichBy.phone && phone) {
    trace.push(`web: reverse by phone "${phone}"`);
    const sn = await searchWeb(`"${phone}"`, cfg.perSourceTimeoutMs.web);
    // TODO: витягнути кандидати назв/сайтів
  }

  // 4) Website доповнення (якщо домен є)
  if (cfg.enrichBy.website && domain) {
    trace.push(`site: complement ${domain}`);
    const site = await fetchSite(domain, cfg.perSourceTimeoutMs.site);
    // TODO: доповнити country/emails/phones/products
  }

  // 5) LinkedIn (лише якщо вмикнуто і є назва)
  if (cfg.sources.socials.linkedin && companyName) {
    trace.push(`linkedin: search "${companyName}"`);
    const li = await findLinkedInCompanyByName(companyName, cfg.perSourceTimeoutMs.linkedin);
    // TODO: перевірити збіг і забрати industry/size/site
  }

  // 6) Платформи (якщо увімкнено і є назва)
  if (companyName && (cfg.sources.platforms.alibaba || cfg.sources.platforms.madeInChina || cfg.sources.platforms.indiamart)) {
    trace.push(`platforms: search "${companyName}"`);
    const pf = await findPlatformsByName(companyName, cfg.sources.platforms, cfg.perSourceTimeoutMs.platforms);
    // TODO: зібрати контакти/продукти/локації
  }

  // 7) Web complements при нестачі полів
  // TODO: якщо немає country/contacts — спробувати точкові запити

  // 8) Merge (мінімальна заглушка на зараз)
  const result: EnrichmentResult = {
    organization: {
      name: companyName,
      domain: domain ?? undefined,
    },
    fields_meta: meta,
    trace,
    status: companyName ? "partial" : "needs_review",
  };

  return NextResponse.json(result);
}
