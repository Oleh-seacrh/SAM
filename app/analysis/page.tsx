// app/analysis/page.tsx
// Product Monitor (LLM-light) for SAM
// 1) Спочатку читаємо JSON-LD (schema.org Product/Offer) -> price + availability по потрібному ML
// 2) Якщо нема/криво — фолбек LLM (ТІЛЬКИ для name/availability) + детерміновані перевірки
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
  "купити",
  "готовий до відправлення",
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

// ---------- Детерміноване виділення ціни зі скоупом (reworked) ----------
const CURRENCY_RX = /(\d{1,3}(?:[ .,\u00A0]\d{3})*(?:[.,]\d{1,2})?)\s*(?:грн\.?|uah|₴|\$|€)\b/gi;

const CTA_ANCHORS = ["купити", "додати в кошик", "add to cart", "buy now", "купити зараз"];
const PRICE_ANCHORS = ["ціна", "price"];
const RECO_HEADERS = [
  "рекомендован",
  "супутн",
  "схожі товари",
  "разом з цим купують",
  "related products",
  "customers also bought",
];

const BAD_PRICE_NEAR = ["стара", "стар", "перекреслен", "зниж", "скидк", "економ", "was", "regular", "rrp"];
const BAD_PREFIXES = ["від"]; // "від 699 грн"
const BAD_SIGNS_AROUND = ["%"]; // -20%, 10%

function _parseNum(num: string): number | null {
  const cleaned = num.replace(/\u00A0/g, " ").replace(/(?<=\d)[ .](?=\d{3}(\D|$))/g, "").replace(/,/, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findIndex(html: string, tokens: string[]): number {
  const t = normText(html);
  for (const s of tokens) {
    const i = t.indexOf(s);
    if (i !== -1) return i;
  }
  return -1;
}

function findH1Index(html: string): number {
  const m = html.match(/<h1[^>]*>/i);
  return m ? m.index! : -1;
}

function findRecoIndex(html: string): number {
  const t = normText(html);
  let best = -1;
  for (const key of RECO_HEADERS) {
    const i = t.indexOf(key);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

type PriceCandidate = { val: number; idx: number; ctx: string; score: number };

function withinTagOrOldClass(ctx: string): boolean {
  if (/<\/?(?:del|s|strike)\b/i.test(ctx)) return true;
  if (/class=["'][^"']*(old|regular|compare)[^"']*["']/i.test(ctx)) return true;
  return false;
}

function looksBadContext(ctx: string): boolean {
  const low = normText(ctx);
  if (BAD_SIGNS_AROUND.some((s) => ctx.includes(s))) return true;
  if (BAD_PRICE_NEAR.some((w) => low.includes(w))) return true;
  if (new RegExp(`(?:^|\\W)(?:${BAD_PREFIXES.join("|")})\\s*$`, "i").test(ctx.slice(0, 12))) return true;
  return false;
}

function listCurrencyCandidates(windowHtml: string, baseIndex: number): PriceCandidate[] {
  const out: PriceCandidate[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(CURRENCY_RX);
  while ((m = r.exec(windowHtml))) {
    const raw = m[1];
    const val = _parseNum(raw);
    if (val == null) continue;

    // локальний контекст ±120 символів
    const i0 = Math.max(0, m.index - 120);
    const i1 = Math.min(windowHtml.length, m.index + m[0].length + 120);
    const ctx = windowHtml.slice(i0, i1);

    if (withinTagOrOldClass(ctx)) continue;
    if (looksBadContext(ctx)) continue;

    out.push({ val, idx: baseIndex + m.index, ctx, score: 0 });
  }
  return out;
}

function scoreCandidate(c: PriceCandidate, anchorIdx: number): number {
  const dist = Math.max(1, Math.abs(c.idx - anchorIdx));
  let score = 100000 / dist;
  if (/(купити|додати в кошик|add to cart|buy)/i.test(c.ctx)) score += 50;
  if (/(ціна|price)/i.test(c.ctx)) score += 25;
  if (c.val < 10) score -= 200; // мікро-значення (доставка 0 грн тощо)
  return score;
}

function sliceMainWindow(html: string): { start: number; end: number } {
  const cta = findIndex(html, CTA_ANCHORS);
  const h1 = findH1Index(html);
  const anchor = cta !== -1 ? cta : h1 !== -1 ? h1 : findIndex(html, PRICE_ANCHORS);
  const reco = findRecoIndex(html);

  const radius = 4000;
  const start = Math.max(0, (anchor !== -1 ? anchor : 0) - radius);
  let end = Math.min(html.length, (anchor !== -1 ? anchor : 0) + radius);

  if (reco !== -1 && reco > start) end = Math.min(end, reco);
  return { start, end };
}

function pickPriceFromDom(html: string): number | null {
  const { start, end } = sliceMainWindow(html);
  const windowHtml = html.slice(start, end);

  const localAnchorIdx = (() => {
    const ctaLocal = findIndex(windowHtml, CTA_ANCHORS);
    if (ctaLocal !== -1) return start + ctaLocal;
    const h1Local = findH1Index(windowHtml);
    if (h1Local !== -1) return start + h1Local;
    const priceLocal = findIndex(windowHtml, PRICE_ANCHORS);
    return priceLocal !== -1 ? start + priceLocal : start;
  })();

  const candidates = listCurrencyCandidates(windowHtml, start);
  if (candidates.length === 0) return null;

  // посилюємо найбільш повторюване значення (часто дубль у mobile/header)
  const freq = new Map<number, number>();
  for (const c of candidates) freq.set(c.val, (freq.get(c.val) || 0) + 1);
  for (const c of candidates) c.score = scoreCandidate(c, localAnchorIdx) + (freq.get(c.val)! - 1) * 30;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].val ?? null;
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
    const parts = text
      .split(/\}\s*,\s*\{/)
      .map((p, i, a) => (i === 0 ? p + "}" : i === a.length - 1 ? "{" + p : "{" + p + "}"));
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
  const m = url.toLowerCase().match(/(\d{2,3})-ml/);
  return m ? Number(m[1]) : null;
}

function pickOfferForMl(offers: OfferLike[], mlWanted: number | null): OfferLike | null {
  if (offers.length === 0) return null;
  if (mlWanted == null) {
    const sorted = offers
      .map((o) => ({
        o,
        p: pickNumber(
          o.price ??
            (Array.isArray(o.priceSpecification)
              ? o.priceSpecification[0]?.price
              : (o.priceSpecification as any)?.price)
        ),
      }))
      .filter((x) => x.p != null)
      .sort((a, b) => (a.p as number) - (b.p as number));
    return sorted[0]?.o ?? offers[0];
  }
  const byName = offers.find((o) => (o.name || "").toLowerCase().includes(`${mlWanted} ml`));
  if (byName) return byName;
  const byUrl = offers.find((o) => (o.url || "").toLowerCase().includes(`${mlWanted}-ml`));
  if (byUrl) return byUrl;
  return null;
}

function extractFromJsonLd(
  html: string,
  url: string
): { name?: string; price?: number | null; availability?: boolean | null } | null {
  const blocks = findProductBlocks(html);
  if (blocks.length === 0) return null;

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
          (Array.isArray(offer.priceSpecification)
            ? offer.priceSpecification[0]?.price
            : (offer.priceSpecification as any)?.price)
      ) ?? null;

    const availability = normalizeAvailability(offer.availability);

    return { name, price, availability };
  }
  return null;
}

// ---------------- LLM (фолбек) — ТІЛЬКИ name/availability ----------------
async function llmExtract(
  html: string,
  url?: string
): Promise<{ name: string | null; price: null; availability: boolean | null }> {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { anyOf: [{ type: "string" }, { type: "null" }] },
      // price тут є у схемі, але ми його ігноруємо (не використовуємо як джерело правди)
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      availability: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["name", "price", "availability"],
  };

  const system =
    "You extract structured data from a single e-commerce product page and return STRICT JSON only. Price is advisory ONLY; numeric price will NOT be trusted.";
  const user = [
    "OUTPUT: JSON with EXACT keys {name, price, availability}.",
    "Do NOT guess — if unsure, use null.",
    "AVAILABILITY: true only if clearly purchasable (e.g., 'В наявності', 'In stock', visible 'Додати в кошик'); false if 'Тимчасово немає в наявності'/'Out of stock'.",
    "NAME: take the product title, not brand/navigation.",
    url ? `URL: ${url}` : "",
    "HTML:",
    html.slice(0, 18000),
  ]
    .filter(Boolean)
    .join("\n");

  const out = await jsonExtract<{
    name: string | null;
    price: number | null;
    availability: boolean | null;
  }>({
    system,
    user,
    schema,
    temperature: 0,
  });

  return {
    name: out?.name ?? null,
    price: null, // важливо: LLM price ігноруємо
    availability: typeof out?.availability === "boolean" ? out!.availability : null,
  };
}

// ---------------- fetch + parse (DOM → JSON-LD як підказка; LLM тільки для name/availability) ----------------
async function fetchAndParse(
  url: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const r = await fetch(url, { headers: { "User-Agent": "SAM-ProductMonitor/1.0" }, cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  const rawHtml = await r.text();
  const html = decodeHtml(rawHtml);

  // (A) JSON-LD підказка
  const fromLd = extractFromJsonLd(html, url);

  // (B) Детермінована наявність
  const detectedAvail = detectAvailability(html);

  // (C) LLM — лише name/availability, якщо треба
  let fallback: { name: string | null; price: null; availability: boolean | null } | null = null;
  if (!fromLd?.name || detectedAvail === null) {
    fallback = await llmExtract(html, url);
  }

  // (D) Фінал
  const name = fromLd?.name ? decodeHtml(fromLd.name) : fallback?.name ? decodeHtml(fallback.name) : null;
  let availability = detectedAvail !== null ? detectedAvail : (fromLd?.availability ?? fallback?.availability ?? null);

  // ЦІНА: DOM — головне джерело; JSON-LD — лише як бекап/верифікація
  let price: number | null = null;
  if (availability !== false) {
    const domPrice = pickPriceFromDom(html);      // головне джерело
    const ldPrice = fromLd?.price ?? null;        // підказка

    if (domPrice != null) {
      price = domPrice;
      if (ldPrice != null && Math.abs(domPrice - ldPrice) / Math.max(1, ldPrice) > 0.05) {
        console.debug("Price mismatch: DOM vs JSON-LD", { domPrice, ldPrice, url });
      }
    } else if (ldPrice != null) {
      const verified = validatePriceInHtml(html, ldPrice); // перевіряємо, що LD-ціна реально «видима»
      price = verified ?? ldPrice;
    } else {
      price = null; // ніяких LLM-чисел
    }
  }

  return { name, price, availability };
}

// ---------------- DB ----------------
async function listProducts(): Promise<Row[]> {
  const sql = getSql();
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
      <p className="text-sm opacity-70">Reads JSON-LD first; DOM has priority for price. Reload = DB only. Refresh = re-parse.</p>

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
        DOM price has priority; JSON-LD is a hint; <code>jsonExtract</code> is used only for name/availability.
      </div>
    </div>
  );
}
