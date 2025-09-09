// app/api/orgs/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// ── helpers (локально, щоб не ламалось без lib/normalize)
function normalizeDomain(raw?: string | null): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  try {
    if (v.startsWith("http://") || v.startsWith("https://")) v = new URL(v).hostname;
  } catch {}
  v = v.replace(/^www\./, "");
  return v || null;
}
function normalizeName(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).trim().replace(/\s+/g, " ");
}
function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  return v.includes("@") ? v : null;
}

export async function POST(req: NextRequest) {
  const sql = getSql();

  // 1) Парсимо тіло
  const body = await req.json().catch(() => ({} as any));
  const name = normalizeName(body?.name);
  const domain = normalizeDomain(body?.domain);
  const country = body?.country ?? null;
  const org_type = body?.org_type ?? "client";

  // emails: допускаємо рядок/масив/порожнє
  const emails: string[] = (Array.isArray(body?.emails) ? body.emails : (body?.emails ? [body.emails] : []))
    .map((e: any) => normalizeEmail(String(e)))
    .filter(Boolean) as string[];

  if (!name) {
    return NextResponse.json({ error: "VALIDATION_ERROR", detail: "Name is required" }, { status: 400 });
  }

  // 2) Soft-lock: перевірка дублів через dedupe API
  //    (company_email/personal_email опційні — передамо всі уніфіковано як emails[])
  const params = new URLSearchParams();
  params.set("name", name);
  if (domain) params.set("domain", domain);
  if (emails[0]) params.set("company_email", emails[0]);
  if (emails[1]) params.set("personal_email", emails[1]);

  const dedupeUrl = new URL("/api/orgs/dedupe", req.url);
  dedupeUrl.search = params.toString();

  const dedupeRes = await fetch(dedupeUrl.toString(), { method: "GET" });
  let duplicates: any[] = [];
  if (dedupeRes.ok) {
    const data = await dedupeRes.json().catch(() => ({}));
    duplicates = data?.duplicates ?? data?.candidates ?? [];
  }

  const allowOverride = req.headers.get("x-allow-duplicate") === "true";
  if (duplicates.length && !allowOverride) {
    return NextResponse.json(
      { error: "DUPLICATE_SOFTLOCK", duplicates },
      { status: 409 }
    );
  }

  // 3) Insert (і обробка hard-lock через унікальні індекси)
  try {
    const org = (await sql/*sql*/`
      insert into organizations (name, domain, country, org_type)
      values (${name}, ${domain}, ${country}, ${org_type})
      returning id, name, domain, country, org_type, created_at;
    ` as any)[0];

    if (emails.length) {
      await sql/*sql*/`
        insert into contacts (org_id, email)
        select ${org.id}, unnest(${sql.array(emails)})
        on conflict (email) do nothing;
      `;
    }

    return NextResponse.json({ org }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const isOrgDomain = msg.includes("organizations_domain_uniq");
    const isOrgName = msg.includes("organizations_name_uniq");
    const isContactEmail = msg.includes("contacts_email_uniq");

    if (isOrgDomain || isOrgName || isContactEmail) {
      return NextResponse.json(
        {
          error: "DUPLICATE_HARDLOCK",
          detail: isOrgDomain
            ? "Organization with the same domain already exists."
            : isOrgName
            ? "Organization with the same name already exists."
            : "Contact with the same email already exists.",
        },
        { status: 409 }
      );
    }
    // інші помилки — наверх
    throw err;
  }
}
