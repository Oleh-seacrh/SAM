import { NextResponse } from "next/server";
import { sql } from "@/lib/db"; // твій клієнт до Postgres (Neon)
export const runtime = "nodejs";

type OrgUpdate = {
  // Основні
  name?: string | null;
  domain?: string | null;
  country?: string | null;
  industry?: string | null;

  // Контакти
  general_email?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;

  // Статус/мета
  status?: string | null;
  tags?: string[] | string | null; // дозволяємо масив або "tag1, tag2"
  size_tag?: string | null;
  source?: string | null;
  note?: string | null;

  // Snapshot інтересів (опційно)
  brand?: string | null;
  product?: string | null;
  quantity?: string | null;
  deal_value_usd?: number | string | null;

  last_contact_at?: string | null; // ISO
};

function normalizeDomain(v?: string | null) {
  if (!v) return null;
  try {
    // прибираємо протокол/шлях, www, переводимо до lower
    const raw = v.trim().toLowerCase();
    const fromUrl = raw.startsWith("http://") || raw.startsWith("https://");
    const host = fromUrl ? new URL(raw).hostname : raw.split("/")[0];
    return host.replace(/^www\./, "");
  } catch {
    return v.trim().toLowerCase().replace(/^www\./, "");
  }
}

function normalizeTags(input: OrgUpdate["tags"]): { csv: string | null } {
  if (input == null) return { csv: null };
  const arr = Array.isArray(input)
    ? input
    : input
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const uniq = Array.from(new Set(arr)).slice(0, 10); // на всяк випадок
  if (!uniq.length) return { csv: null };
  return { csv: uniq.join(",") };
}

function toNullableNumber(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNullableDate(v: unknown) {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** GET /api/organizations/:id */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const rows =
      await sql/*sql*/`SELECT * FROM public.organizations WHERE id = ${id} LIMIT 1`;
    if (!rows?.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to fetch organization", detail: e?.message },
      { status: 500 }
    );
  }
}

/** PUT /api/organizations/:id — зберігає ВСІ поля модалки одним запитом */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const body = (await req.json()) as OrgUpdate;

  // 1) Зчитуємо поточний рядок, щоб зробити merge (на випадок часткового payload)
  const currentRows =
    await sql/*sql*/`SELECT * FROM public.organizations WHERE id = ${id} LIMIT 1`;
  if (!currentRows?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const current = currentRows[0];

  // 2) Нормалізація вхідних значень
  const tagsCsv = normalizeTags(body.tags).csv;
  const dealValue = toNullableNumber(body.deal_value_usd);
  const lastContactISO = toNullableDate(body.last_contact_at);
  const domainNorm = normalizeDomain(body.domain);

  // 3) Формуємо наступний стан (merge)
  const next = {
    name: body.name ?? current.name,
    domain: domainNorm ?? current.domain,
    country: body.country ?? current.country,
    industry: body.industry ?? current.industry,

    general_email: body.general_email ?? current.general_email,
    contact_name: body.contact_name ?? current.contact_name,
    contact_email: body.contact_email ?? current.contact_email,
    contact_phone: body.contact_phone ?? current.contact_phone,

    status: body.status ?? current.status,
    size_tag: body.size_tag ?? current.size_tag,
    source: body.source ?? current.source,
    note: body.note ?? current.note,

    // snapshot поля (не обов’язкові)
    brand: body.brand ?? current.brand,
    product: body.product ?? current.product,
    quantity: body.quantity ?? current.quantity,
    deal_value_usd:
      dealValue !== null ? dealValue : current.deal_value_usd ?? null,

    // дати
    last_contact_at:
      lastContactISO !== null ? lastContactISO : current.last_contact_at ?? null,

    // tags як CSV -> у БД перетворимо на text[]
    tagsCsv:
      tagsCsv !== null
        ? tagsCsv
        : Array.isArray(current.tags)
        ? (current.tags as string[]).join(",")
        : current.tags ?? null,
  };

  try {
    // 4) Оновлюємо всі колонки одним запитом.
    //    tags беремо з CSV і конвертуємо в text[] через string_to_array(..).
    const updated =
      await sql/*sql*/`
      UPDATE public.organizations
      SET
        name            = ${next.name},
        domain          = ${next.domain},
        country         = ${next.country},
        industry        = ${next.industry},
        general_email   = ${next.general_email},
        contact_name    = ${next.contact_name},
        contact_email   = ${next.contact_email},
        contact_phone   = ${next.contact_phone},
        status          = ${next.status},
        size_tag        = ${next.size_tag},
        source          = ${next.source},
        note            = ${next.note},
        brand           = ${next.brand},
        product         = ${next.product},
        quantity        = ${next.quantity},
        deal_value_usd  = ${next.deal_value_usd},
        last_contact_at = ${next.last_contact_at},
        tags            = CASE
                            WHEN ${next.tagsCsv} IS NULL OR ${next.tagsCsv} = '' THEN NULL
                            ELSE string_to_array(${next.tagsCsv}, ',')
                          END
      WHERE id = ${id}
      RETURNING *;
    `;

    // тригер оновить updated_at автоматично
    return NextResponse.json({ ok: true, data: updated[0] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Failed to update organization", detail: e?.message },
      { status: 500 }
    );
  }
}
