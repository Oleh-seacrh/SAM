export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getDefaultEnrichConfig, EnrichConfig } from "@/lib/enrich/config";
import { normalizeDomain, normalizeEmail, normalizePhone } from "@/lib/enrich/normalize";
import { fetchSite } from "@/lib/enrich/site";
import { searchWeb } from "@/lib/enrich/web";
import { findLinkedInCompanyByName } from "@/lib/enrich/linkedin";
import { findPlatformsByName } from "@/lib/enrich/platforms";
import { nameSimilarity } from "@/lib/enrich/matching";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";
import { getFromCache, saveToCache } from "@/lib/enrich/cache";
import { canRunEnrichToday } from "@/lib/enrich/limits";

type InputType = "domain" | "email" | "phone" | "name";
type EnrichmentResult = {
  organization: {
    name?: string; domain?: string; country_iso2?: string;
    industry?: string; size?: string; emails?: string[]; phones?: string[];
    tags?: string[]; source_primary?: string; id?: string;
  };
  fields_meta: Record<string, { value?: any; source?: string; confidence?: number }>;
  trace: string[];
  status: "enriched" | "partial" | "contact-only" | "needs_review";
};

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  const cfg = (await req.json()) as EnrichConfig;

  await sql/*sql*/`
    insert into tenant_settings (tenant_id, enrich_config)
    values (${tenantId}, ${cfg}::jsonb)
    on conflict (tenant_id) do update
      set enrich_config = excluded.enrich_config,
          updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();
  const body = (await req.json()) as { input: string; input_type?: InputType };
  const raw = (body.input || "").trim();

  // ліміт (наприклад 20/день для Trial; виставиш за планом)
  const allowed = await canRunEnrichToday(tenantId, 20);
  if (!allowed) return NextResponse.json({ error: "Daily enrich limit reached" }, { status: 429 });

  // кеш
  const cached = await getFromCache(tenantId, raw);
  if (cached) {
    cached.trace = [...(cached.trace || []), "cache: hit"];
    return NextResponse.json(cached);
  }

  // конфіг
  let cfg: EnrichConfig = getDefaultEnrichConfig();
  try {
    const rows = await sql/*sql*/`select enrich_config from tenant_settings where tenant_id = ${tenantId} limit 1`;
    cfg = rows[0]?.enrich_config ?? cfg;
  } catch {/* ignore */ }

  // нормалізація
  let domain = body.input_type === "domain" ? normalizeDomain(raw) : null;
  let email  = body.input_type === "email"  ? normalizeEmail(raw)  : null;
  let phone  = body.input_type === "phone"  ? normalizePhone(raw)  : null;
  let name   = body.input_type === "name"   ? raw : null;

  if (!domain && raw.includes(".")) domain = normalizeDomain(raw);
  if (!email && raw.includes("@")) email = normalizeEmail(raw);
  if (!phone && raw.startsWith("+")) phone = normalizePhone(raw);

  const trace: string[] = [];
  const meta: EnrichmentResult["fields_meta"] = {};
  let companyName: string | undefined = name ?? undefined;

  // Етап 0 — Name discovery
  if (!companyName && cfg.enrichBy.website && domain) {
    trace.push(`site: fetch ${domain}`);
    const site = await fetchSite(domain, cfg.perSourceTimeoutMs.site);
    if (site?.companyName) {
      companyName = site.companyName;
      meta["name"] = { value: companyName, source: "site", confidence: 0.9 };
    }
    if (site?.emails?.length) meta["emails"] = { value: site.emails, source: "site", confidence: 0.9 };
    if (site?.phones?.length) meta["phones"] = { value: site.phones, source: "site", confidence: 0.9 };
  }

  if (!companyName && cfg.enrichBy.email && email && /@(gmail|yahoo|outlook)\./i.test(email)) {
    trace.push(`web: reverse by email "${email}"`);
    const sn = await searchWeb(`"${email}"`, cfg.perSourceTimeoutMs.web);
    // TODO: витягнути кандидати назв/сайтів зі сніпетів
  }

  if (!companyName && cfg.enrichBy.phone && phone) {
    trace.push(`web: reverse by phone "${phone}"`);
    const sn = await searchWeb(`"${phone}"`, cfg.perSourceTimeoutMs.web);
    // TODO: витягнути кандидати назв/сайтів
  }

  // Website доповнення
  if (cfg.enrichBy.website && domain) {
    trace.push(`site: complement ${domain}`);
    const site = await fetchSite(domain, cfg.perSourceTimeoutMs.site);
    if (!companyName && site?.companyName) {
      companyName = site.companyName;
      meta["name"] = { value: companyName, source: "site", confidence: 0.9 };
    }
    if (site?.emails?.length && !meta["emails"]) meta["emails"] = { value: site.emails, source: "site", confidence: 0.9 };
    if (site?.phones?.length && !meta["phones"]) meta["phones"] = { value: site.phones, source: "site", confidence: 0.9 };
  }

  // LinkedIn
  if (cfg.sources.socials.linkedin && companyName) {
    trace.push(`linkedin: search "${companyName}"`);
    const li = await findLinkedInCompanyByName(companyName, cfg.perSourceTimeoutMs.linkedin);
    // TODO: перевірити збіг і забрати industry/size/site
    if (li?.industry && !meta["industry"]) meta["industry"] = { value: li.industry, source: "linkedin", confidence: 0.85 };
    if (li?.size && !meta["size"])       meta["size"]     = { value: li.size,     source: "linkedin", confidence: 0.85 };
    if (!domain && li?.website) domain = normalizeDomain(li.website) || domain;
  }

  // Платформи
  if (companyName && (cfg.sources.platforms.alibaba || cfg.sources.platforms.madeInChina || cfg.sources.platforms.indiamart)) {
    trace.push(`platforms: search "${companyName}"`);
    const pf = await findPlatformsByName(companyName, cfg.sources.platforms, cfg.perSourceTimeoutMs.platforms);
    // TODO: зібрати контакти/продукти/локації і додати в meta
  }

  // Результат (поки без складного merge/scoring)
  const result: EnrichmentResult = {
    organization: {
      name: companyName,
      domain: domain ?? undefined,
    },
    fields_meta: meta,
    trace,
    status: companyName ? "partial" : "needs_review",
  };

  // Лог
  await sql/*sql*/`
    insert into enrichment_logs (tenant_id, input, result)
    values (${tenantId}, ${raw}, ${result}::jsonb)
  `;

  // Кеш
  await saveToCache(tenantId, raw, result);

  return NextResponse.json(result);
}
