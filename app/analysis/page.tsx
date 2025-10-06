// app/analysis/page.tsx
// Product Monitor (LLM-light) for SAM
// 1) Спочатку читаємо JSON-LD (schema.org Product/Offer) -> price + availability по потрібному ML
// 2) Якщо нема/криво — фолбек LLM (через твій jsonExtract) + детерміновані перевірки
// 3) Reload list: просто перечитує БД; Refresh — перепарс

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";
import { jsonExtract } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  tenant_id: string | null;
  url: string;
  name: string | null;
  price: string | null; // numeric з Neon приходить рядком
  availability: boolean | null;
  updated_at: string | null;
};

// ---------------- helpers ----------------
async function getTenantId(): Promise<string | null> {
  return (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | undefined) || null;
}
const decodeHtml = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const NEG_WORDS = [
  "тимчасово немає в наявності",
  "немає в наявності",
  "відсутній",
  "out of stock",
  "sold out",
  "під замовлення",
];
const POS_WORDS = [
  "в наявності",
  "є в наявності",
  "in stock",
  "available",
  "додати в кошик",
  "add to cart",
];

const normText = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ").replace(/\s+/g, " ").toLowerCase();

function detectAvailability(html: string): boolean | null {
  const t = normText(html);
  for (const w of NEG_WORDS) if (t.includes(w)) return false; // NEG > POS
  for (const w of POS_WORDS) {
    if (t.includes(w) && !t.includes("немає " + w) && !t.includes("тимчасово немає " + w)) return true;
  }
  return null;
}

function extractNumbersFromHtml(html: string): number[] {
  const body = html.replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ");
  const rx = /\b\d{1,3}(?:[ .,\u00A0]\d{3})*(?:[.,]\d{1,2})?\b/g;
  const out: number[] = [];
  for (const m of body.matchAll(rx)) {
    const raw = m[0];
    const cleaned = raw
      .replace(/\u00A0/g, " ")
      .replace(/(?<=\d)[ .](?=\d{3}(\D|$))/g, "")
      .replace(/,/, ".");
    const num = Number(cleaned);
    if (!Number.isNaN(num)) out.push(num);
  }
  return out;
}

function validatePriceInHtml(html: string, price: number | null): number | null {
  if (price == null) return null;
  const nums = extractNumbersFromHtml(html);
  const eps = 0.01;
  for (const n of nums) if (Math.abs(n - price) <= eps) return price;
  return null;
}

// ---------------- JSON-LD parser ----------------
type OfferLike = {
  price?: number | string;
  priceSpecification?: { price?: number | string } | Array<{ price?: number | string }>;
  availability?: string;
  sku?: string;
  gtin13?: string;
  name?: string;
  url?: string;
};

function pickNumber(x: unknown): number | null {
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const cleaned = x.replace(/[^\d.,\u00A0 ]/g, "").replace(/\u00A0/g, " ");
    const normalized = cleaned.replace(/(?<=\d)[ .](?=\d{3}(\D|$))/g, "").replace(/,/, ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseJson(text: string): any[] {
  const blocks: any[] = [];
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) blocks.push(...data);
    else blocks.push(data);
  } catch {
    // інколи кілька JSON у одному <script> — пробуємо на рівні рядків
    const parts = text.split(/\}\s*,\s*\{/).map((p, i, a) => (i === 0 ? p + "}" : i === a.length - 1 ? "{" + p : "{" + p + "}"));
    for (const p of parts) {
      try {
        blocks.push(JSON.parse(p));
      } catch {}
    }
  }
  return blocks;
}

function findProductBlocks(html: string): any[] {
  const res: any[] = [];
  const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const content = decodeHtml(m[1].trim());
    const blocks = parseJson(content);
    for (const b of blocks) res.push(b);
  }
  return res;
}

function normalizeAvailability(av: string | undefined): boolean | null {
  if (!av) return null;
  const a = av.toLowerCase();
  if (a.includes("instock")) return true;
  if (a.includes("outofstock") || a.includes("soldout")) return false;
  return null;
}

function parseMlFromUrl(url: string): number | null {
  // ...-30-ml-..., ...-50-ml-... (або ML у верхньому регістрі)
  const m = url.toLowerCase().match(/(\d{2,3})-ml/);
  return m ? Number(m[1]) : null;
}

function pickOfferForMl(offers: OfferLike[], mlWanted: number | null): OfferLike | null {
  if (offers.length === 0) return null;
  if (mlWanted == null) {
    // якщо ml не вказано — беремо мінімальну актуальну ціну
    const sorted = offers
      .map((o) => ({ o, p: pickNumber(o.price ?? (Array.isArray(o.priceSpecification) ? o.priceSpecification[0]?.price : (o.priceSpecification as any)?.price)) }))
      .filter((x) => x.p != null)
      .sort((a, b) => (a.p as number) - (b.p as number));
    return sorted[0]?.o ?? offers[0];
  }
  // пробуємо знайти в назві/URL 30 ML / 50 ML / 90 ML
  const byName = offers.find((o) => (o.name || "").toLowerCase().includes(`${mlWanted} ml`));
  if (byName) return byName;
  const byUrl = offers.find((o) => (o.url || "").toLowerCase().includes(`${mlWanted}-ml`));
  if (byUrl) return byUrl;
  return null;
}

function extractFromJsonLd(html: string, url: string): { name?: string; price?: number | null; availability?: boolean | null } | null {
  const blocks = findProductBlocks(html);
  if (blocks.length === 0) return null;

  // шукаємо Product
  const products: any[] = [];
  for (const b of blocks) {
    if (!b) continue;
    const type = (b["@type"] || b.type || "").toString().toLowerCase();
    if (type.includes("product")) products.push(b);
    if (Array.isArray(b["@graph"])) {
      for (const g of b["@graph"]) {
        const t = (g["@type"] || g.type || "").toString().toLowerCase();
        if (t.includes("product")) products.push(g);
      }
    }
  }
  if (products.length === 0) return null;

  // збираємо всі оффери
  const mlWanted = parseMlFromUrl(url);
  for (const p of products) {
    const name: string | undefined = p.name || p.title;
    const offers: OfferLike[] = [];
    const raw = p.offers;
    if (raw) {
      if (Array.isArray(raw)) offers.push(...(raw as OfferLike[]));
      else offers.push(raw as OfferLike);
    }
    if (offers.length === 0) continue;

    let offer: OfferLike | null = pickOfferForMl(offers, mlWanted);
    if (!offer) offer = offers[0];

    let price =
      pickNumber(
        offer.price ??
          (Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0]?.price : (offer.priceSpecification as any)?.price)
      ) ?? null;

    const availability = normalizeAvailability(offer.availability);

    return { name, price, availability };
  }
  return null;
}

// ---------------- LLM (фолбек) ----------------
async function llmExtract(
  html: string,
  url?: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { anyOf: [{ type: "string" }, { type: "null" }] },
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      availability: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["name", "price", "availability"],
  };

  const system = "You extract structured data from a single e-commerce product page and return STRICT JSON only.";
  const user = [
    "OUTPUT: JSON with EXACT keys {name, price, availability}.",
    "Do NOT guess — if unsure, use null.",
    "PRICE: if multiple (old vs discounted), return current/active; ignore <del>/old/strike/was/regular/rrp; dot-decimal number only.",
    "AVAILABILITY: true only if clearly purchasable (e.g., 'В наявності', 'In stock', visible 'Додати в кошик'); false if 'Тимчасово немає в наявності'/'Out of stock'.",
    url ? `URL: ${url}` : "",
    "HTML:",
    html.slice(0, 18000),
  ]
    .filter(Boolean)
    .join("\n");

  const out = await jsonExtract<{ name: string | null; price: number | null; availability: boolean | null }>({
    system,
    user,
    schema,
    temperature: 0,
  });

  return {
    name: out?.name ?? null,
    price: typeof out?.price === "number" ? out!.price : null,
    availability: typeof out?.availability === "boolean" ? out!.availability : null,
  };
}

// ---------------- fetch + parse (JSON-LD → детермінатика → LLM-фолбек) ----------------
async function fetchAndParse(
  url: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const r = await fetch(url, { headers: { "User-Agent": "SAM-ProductMonitor/1.0" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  const rawHtml = await r.text();
  const html = decodeHtml(rawHtml);

  // (A) Спроба через JSON-LD (найнадійніше для ціни по ML)
  const fromLd = extractFromJsonLd(html, url);

  // (B) Детермінована наявність з тексту сторінки (перекриває все)
  const detectedAvail = detectAvailability(html);

  // (C) Якщо JSON-LD не дав ні ціну, ні ім'я — фолбек до LLM
  let fallback: { name: string | null; price: number | null; availability: boolean | null } | null = null;
  if (!fromLd?.price || !fromLd?.name) {
    fallback = await llmExtract(html, url);
  }

  // (D) Збираємо фінал
  const name = fromLd?.name ? decodeHtml(fromLd.name) : fallback?.name ? decodeHtml(fallback.name) : null;

  // якщо товар відсутній — price = null
  let availability = detectedAvail !== null ? detectedAvail : (fromLd?.availability ?? fallback?.availability ?? null);

  let price: number | null = null;
  if (availability !== false) {
    // Пріоритет: JSON-LD → (валідація в HTML) → LLM (з валідацією)
    price = fromLd?.price ?? null;
    if (price != null) {
      // опційна валідація: інколи у JSON-LD є ціни всіх варіантів — але ми вже вибрали offer по ML
      price = validatePriceInHtml(html, price) ?? price; // якщо в HTML не знайдено — все одно лишаємо з JSON-LD
    } else if (fallback?.price != null) {
      price = validatePriceInHtml(html, fallback.price);
    }
  }

  return { name, price, availability };
}

// ---------------- DB ----------------
async function listProducts(): Promise<Row[]> {
  const sql = getSql();
  // Тимчасово без фільтра по tenant_id — показуємо все
  return await sql<Row[]>`
    SELECT id, tenant_id, url, name, price::text AS price, availability, updated_at::text AS updated_at
    FROM analysis_products
    ORDER BY updated_at DESC NULLS LAST, url ASC
  `;
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
    RETURNING id, tenant_id, url, name, price::text AS price, availability, updated_at::text AS updated_at
  `;
  return rows[0];
}

// ---------------- Server Actions ----------------
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
export async function reloadListAction() {
  "use server";
  revalidatePath("/analysis");
}
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

// ---------------- Page ----------------
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
      <p className="text-sm opacity-70">Reads JSON-LD first; falls back to GPT. Reload = DB only. Refresh = re-parse.</p>

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
          <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">Reload list</button>
        </form>
        <form action={refreshAllAction}>
          <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">Refresh all (re-parse)</button>
        </form>
      </div>

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
                  <td className="px-3 py-2 align-top max-w-[520px]">
                    <a href={row.url} target="_blank" rel="noreferrer" className="underline break-all">
                      {row.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top max-w-[340px]" title={displayName}>
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
                      <button className="rounded-xl px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Refresh</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-60">
        Uses JSON-LD when available and <code>jsonExtract</code> as fallback under <code>@/lib/llm</code>.
      </div>
    </div>
  );
}
