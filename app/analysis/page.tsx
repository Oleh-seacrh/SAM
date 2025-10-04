// app/analysis/page.tsx
// Single-file implementation for a simple AI‑powered product monitor that
// stores URL, name, price, availability in Neon Postgres and shows a basic UI.
// Drop-in replacement for the placeholder /analysis page.
//
// ✅ Features (MVP):
// - Creates a table if it doesn't exist (per-tenant)
// - Add product URL(s)
// - List current data (url, name, price, availability, updated_at)
// - Refresh one / Refresh all (fetches page, parses heuristically; optional LLM fallback)
// - All server logic implemented via Next.js Server Actions in this single file
//
// Notes:
// - Uses lib/db.getSql() (Neon) and lib/auth.getTenantIdFromSession() from your repo
// - No extra NPM deps required; heuristics are regex‑based
// - Optional LLM fallback via OPENAI_API_KEY (if present). Uses OpenAI Chat Completions
// - Price stored as NUMERIC; availability stored as BOOLEAN
// - Table name: analysis_products (unique per (tenant_id, url))

import { unstable_noStore as noStore } from "next/cache";
import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// ---------- Types ----------
export type ProductRow = {
  id: string;
  tenant_id: string | null;
  url: string;
  name: string | null;
  price: string | null; // numeric comes back as string from Neon
  availability: boolean | null;
  updated_at: string | null;
};

// ---------- DDL (run on first load) ----------
async function ensureTable() {
  // DDL disabled here because you created the table manually.
  // We just ping the DB so the page won’t crash if CREATE EXTENSION is forbidden on prod.
  const sql = getSql();
  try { await sql`select 1`; } catch (e) { console.error("ensureTable ping failed", e); }
}

// ---------- Heuristics parser (no extra deps) ----------
const PRICE_RE = /(?<price>[\d\s.,]{1,20})\s*(?<cur>₴|грн|uah|usd|\$|€|eur|gbp)?/i;
const POS = ["в наявності", "є в наявності", "in stock", "available", "add to cart", "buy"]; 
const NEG = ["немає", "відсут", "out of stock", "sold out", "під замовлення"]; 

function textOnly(html: string) {
  // Remove tags quickly; not perfect but fast and dependency‑free
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractName(html: string): string | null {
  // Try <meta property="og:title">, then <title>, then first <h1>
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i);
  if (og?.[1]) return og[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]) return title[1].trim();
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]) return h1[1].trim();
  return null;
}

function extractPriceCurrency(txt: string): { price: number | null } {
  const m = txt.match(PRICE_RE);
  if (!m || !m.groups) return { price: null };
  const raw = (m.groups["price"] || "").replace(/\s/g, "").replace(",", ".");
  const num = Number(raw);
  if (Number.isNaN(num)) return { price: null };
  return { price: num };
}

function extractAvailability(txt: string): boolean | null {
  const low = txt.toLowerCase();
  for (const p of POS) if (low.includes(p)) return true;
  for (const n of NEG) if (low.includes(n)) return false;
  return null;
}

// ---------- Optional LLM fallback ----------
async function llmExtract(html: string): Promise<{ name?: string|null; price?: number|null; availability?: boolean|null } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  // Keep prompt tight; ask for JSON only.
  const user = `Return JSON with keys: name (string|null), price (number|null), availability (true|false|null). HTML: ${html.slice(0, 20000)}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------- Core parse + upsert ----------
async function fetchAndParse(url: string): Promise<{ name: string|null; price: number|null; availability: boolean|null }> {
  const r = await fetch(url, { headers: { "User-Agent": "SAM-ProductMonitor/1.0" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  const html = await r.text();
  const txt = textOnly(html);

  let name = extractName(html);
  let { price } = extractPriceCurrency(txt);
  let availability = extractAvailability(txt);

  // Fallback to LLM if some fields are missing
  if ((name == null || price == null || availability == null)) {
    const ai = await llmExtract(html);
    if (ai) {
      if (name == null && typeof ai.name !== "undefined") name = ai.name ?? null;
      if (price == null && typeof ai.price !== "undefined") price = ai.price ?? null;
      if (availability == null && typeof ai.availability !== "undefined") availability = ai.availability ?? null;
    }
  }

  return { name: name ?? null, price: price ?? null, availability: availability ?? null };
}

async function upsertProduct(url: string) {
  const sql = getSql();
  const tenantId = (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | null) || null;
  const parsed = await fetchAndParse(url);
  // upsert by (tenant_id, url)
  const rows = await sql<ProductRow[]>`
    INSERT INTO analysis_products (tenant_id, url, name, price, availability, updated_at)
    VALUES (${tenantId}, ${url}, ${parsed.name}, ${parsed.price}, ${parsed.availability}, now())
    ON CONFLICT (tenant_id, url) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      availability = EXCLUDED.availability,
      updated_at = now()
    RETURNING id, tenant_id, url, name, price::text as price, availability, updated_at::text;
  `;
  return rows[0];
}

async function listProducts(): Promise<ProductRow[]> {
  const sql = getSql();
  const tenantId = (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | null) || null;
  const rows = await sql<ProductRow[]>`
    SELECT id, tenant_id, url, name, price::text as price, availability, updated_at::text
    FROM analysis_products
    WHERE (tenant_id IS NULL AND ${tenantId} IS NULL) OR tenant_id = ${tenantId}
    ORDER BY updated_at DESC NULLS LAST, url ASC
  `;
  return rows;
}

// ---------- Server Actions ----------
export const dynamic = "force-dynamic";

async function init() {
  noStore();
  await ensureTable();
}

export async function addUrlAction(formData: FormData) {
  "use server";
  const url = String(formData.get("url") || "").trim();
  if (!url) return;
  await ensureTable();
  await upsertProduct(url);
  revalidatePath("/analysis");
}

export async function refreshOneAction(formData: FormData) {
  "use server";
  const url = String(formData.get("url") || "").trim();
  if (!url) return;
  await upsertProduct(url);
  revalidatePath("/analysis");
}

export async function refreshAllAction() {
  "use server";
  await ensureTable();
  const all = await listProducts();
  for (const row of all) {
    try { await upsertProduct(row.url); } catch {}
  }
  revalidatePath("/analysis");
}

// ---------- UI ----------
export const runtime = "nodejs";

export default async function AnalysisPage() {
  await init();
  let items: ProductRow[] = [];
  try {
    items = await listProducts();
  } catch (e) {
    console.error("listProducts failed", e);
  }
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Analysis</h1>
      <p className="text-sm opacity-70">Simple product monitor: URL → name, price, availability. Data saved in Neon.</p>

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

      {/* Bulk refresh */}
      <form action={refreshAllAction}>
        <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">Refresh all</button>
      </form>

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
                <td colSpan={6} className="px-3 py-6 text-center opacity-60">No items yet. Add a product URL above.</td>
              </tr>
            )}
            {items.map((row) => (
              <tr key={row.id} className="bg-neutral-900/40 hover:bg-neutral-900">
                <td className="px-3 py-2 align-top max-w-[380px]">
                  <a href={row.url} target="_blank" className="underline break-all">{row.url}</a>
                </td>
                <td className="px-3 py-2 align-top max-w-[320px]">
                  <div className="truncate" title={row.name ?? undefined}>{row.name ?? "—"}</div>
                </td>
                <td className="px-3 py-2 align-top">{row.price ?? "—"}</td>
                <td className="px-3 py-2 align-top">
                  {row.availability === null ? "—" : row.availability ? (
                    <span className="inline-flex items-center rounded-lg px-2 py-1 bg-green-600/20 text-green-300">In stock</span>
                  ) : (
                    <span className="inline-flex items-center rounded-lg px-2 py-1 bg-red-600/20 text-red-300">Out</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top opacity-70">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</td>
                <td className="px-3 py-2 align-top">
                  <form action={refreshOneAction} className="inline">
                    <input type="hidden" name="url" value={row.url} />
                    <button className="rounded-xl px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Refresh</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-60">
        Tip: set <code>OPENAI_API_KEY</code> in your env to enable LLM fallback for tricky pages.
      </div>
    </div>
  );
}
