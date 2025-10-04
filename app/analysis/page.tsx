// app/analysis/page.tsx
// Product Monitor (LLM-only) for SAM
// - "Reload list" лише перечитує з БД і оновлює таблицю на екрані (без парсингу)
// - "Refresh all (re-parse)" фетчить HTML і просить LLM (через твій jsonExtract) витягнути name/price/availability
// - Показує записи навіть якщо tenant_id не збігається (fallback: якщо пусто — прочитати всі)
//
// ПРИМІТКА: DDL тут немає (таблицю ти вже створив).

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";
import { jsonExtract } from "@/lib/llm"; // твій існуючий хелпер

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  tenant_id: string | null;
  url: string;
  name: string | null;
  price: string | null;        // numeric з Neon приходить рядком
  availability: boolean | null;
  updated_at: string | null;
};

// --------- helpers ----------
async function getTenantId(): Promise<string | null> {
  return (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | undefined) || null;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// --------- LLM через твій jsonExtract ----------
async function llmExtract(html: string, url?: string): Promise<{
  name: string | null;
  price: number | null;
  availability: boolean | null;
}> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { anyOf: [{ type: "string" }, { type: "null" }] },
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      availability: { anyOf: [{ type: "boolean" }, { type: "null" }] }
    },
    required: ["name", "price", "availability"]
  };

  const system =
    "You extract structured data from a single e-commerce product page and return STRICT JSON only.";
  const user = [
    "Return JSON with EXACT keys: name (string|null), price (number|null), availability (true|false|null).",
    "Normalize price to a dot-decimal number (examples: '1 299,00' -> 1299.00 ; '2.499,50' -> 2499.50 ; '1,199.00' -> 1199.00).",
    "Do NOT include currency signs in price. If not found, use null.",
    url ? `URL: ${url}` : "",
    "HTML:",
    html.slice(0, 18000)
  ]
    .filter(Boolean)
    .join("\n");

  const out = await jsonExtract<{ name: string | null; price: number | null; availability: boolean | null }>({
    system,
    user,
    schema,
    temperature: 0
    // за потреби тут можна передати model/provider відповідно до твого llm.ts
  });

  return {
    name: out?.name ?? null,
    price: typeof out?.price === "number" ? out!.price : null,
    availability: typeof out?.availability === "boolean" ? out!.availability : null
  };
}

// --------- fetch + parse через LLM ----------
async function fetchAndParse(url: string): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const r = await fetch(url, { headers: { "User-Agent": "SAM-ProductMonitor/1.0" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  const html = await r.text();

  const ai = await llmExtract(html, url);

  const name = ai.name ? decodeHtml(ai.name) : null;
  const price = ai.price ?? null;
  const availability = ai.availability ?? null;

  return { name, price, availability };
}

// --------- DB ----------
async function listProductsForTenant(tenantId: string | null): Promise<Row[]> {
  const sql = getSql();
  return await sql<Row[]>`
    SELECT
      id::text,
      tenant_id::text,
      url,
      name,
      price::text AS price,
      availability,
      updated_at::text AS updated_at
    FROM analysis_products
    WHERE (${tenantId} IS NULL AND tenant_id IS NULL) OR tenant_id = ${tenantId}
    ORDER BY updated_at DESC NULLS LAST, url ASC
  `;
}

// fallback: якщо для цього tenant пусто — показати всі (щоб ти бачив дані відразу)
async function listProducts(): Promise<Row[]> {
  const tenantId = await getTenantId();
  const sql = getSql();
  let rows = await listProductsForTenant(tenantId);
  if (rows.length === 0) {
    rows = await sql<Row[]>`
      SELECT
        id::text,
        tenant_id::text,
        url,
        name,
        price::text AS price,
        availability,
        updated_at::text AS updated_at
      FROM analysis_products
      ORDER BY updated_at DESC NULLS LAST, url ASC
      LIMIT 500
    `;
  }
  return rows;
}

async function upsertProduct(url: string): Promise<Row> {
  const sql = getSql();
  const tenantId = await getTenantId();
  const parsed = await fetchAndParse(url);

  const rows = await sql<Row[]>`
    INSERT INTO analysis_products (tenant_id, url, name, price, availability, updated_at)
    VALUES (${tenantId}, ${url}, ${parsed.name}, ${parsed.price}, ${parsed.availability}, now())
    ON CONFLICT (tenant_id, url) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      availability = EXCLUDED.availability,
      updated_at = now()
    RETURNING
      id::text,
      tenant_id::text,
      url,
      name,
      price::text AS price,
      availability,
      updated_at::text AS updated_at
  `;
  return rows[0];
}

// --------- Server Actions ---------
// Додає URL та одразу перепарсює (LLM)
export async function addUrlAction(formData: FormData) {
  "use server";
  const url = String(formData.get("url") || "").trim();
  if (!url) return;
  try {
    await upsertProduct(url);
  } catch (e) {
    console.error("addUrlAction failed:", e);
  }
  revalidatePath("/analysis");
}

// Лише перечитує список з БД і оновлює сторінку (без парсингу)
export async function reloadListAction() {
  "use server";
  revalidatePath("/analysis");
}

// Повний перепарсинг усіх URL
export async function refreshAllAction() {
  "use server";
  try {
    const all = await listProducts();
    for (const row of all) {
      try {
        await upsertProduct(row.url);
      } catch (e) {
        console.error("refreshAllAction: one URL failed:", row.url, e);
      }
    }
  } catch (e) {
    console.error("refreshAllAction failed:", e);
  }
  revalidatePath("/analysis");
}

// Перепарсинг одного URL (LLM)
export async function refreshOneAction(formData: FormData) {
  "use server";
  const url = String(formData.get("url") || "").trim();
  if (!url) return;
  try {
    await upsertProduct(url);
  } catch (e) {
    console.error("refreshOneAction failed:", e);
  }
  revalidatePath("/analysis");
}

// --------- Page ----------
export default async function AnalysisPage() {
  noStore();

  let items: Row[] = [];
  try {
    items = await listProducts();
  } catch (e) {
    console.error("listProducts failed:", e);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Analysis</h1>
      <p className="text-sm opacity-70">
        LLM-only product monitor. Add/Reload to view DB data. Refresh to re-parse via GPT.
      </p>

      {/* Add URL */}
      <form action={addUrlAction} className="flex gap-2 items-center">
        <input
          type="url"
          name="url"
          required
          placeholder="https://example.com/product/123"
          className="w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 outline-none"
        />
        <button className="rounded-xl px-4 py-2 bg-white text-black hover:opacity-90">Add</button>
      </form>

      <div className="flex gap-2">
        <form action={reloadListAction}>
          <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">
            Reload list
          </button>
        </form>
        <form action={refreshAllAction}>
          <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">
            Refresh all (re-parse)
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left opacity-70">
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Availability</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center opacity-60">
                  No items yet. Add a product URL above or click Reload list.
                </td>
              </tr>
            )}
            {items.map((row) => {
              const displayName = row.name ? decodeHtml(row.name) : "—";
              return (
                <tr key={row.id} className="bg-neutral-900/40 hover:bg-neutral-900">
                  <td className="px-3 py-2 align-top max-w-[380px]">
                    <a href={row.url} target="_blank" rel="noreferrer" className="underline break-all">
                      {row.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top max-w-[320px]" title={displayName}>
                    <div className="truncate">{displayName}</div>
                  </td>
                  <td className="px-3 py-2 align-top">{row.price ?? "—"}</td>
                  <td className="px-3 py-2 align-top">
                    {row.availability === null ? (
                      "—"
                    ) : row.availability ? (
                      <span className="inline-flex items-center rounded-lg px-2 py-1 bg-green-600/20 text-green-300">In stock</span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg px-2 py-1 bg-red-600/20 text-red-300">Out</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top opacity-70">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <form action={refreshOneAction} className="inline">
                      <input type="hidden" name="url" value={row.url} />
                      <button className="rounded-xl px-3 py-1 border border-neutral-700 hover:bg-neutral-800">
                        Refresh
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-60">
        Uses <code>jsonExtract</code> from <code>@/lib/llm</code>. Ensure provider/model configured there.
      </div>
    </div>
  );
}
