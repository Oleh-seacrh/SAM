// app/analysis/page.tsx (LLM-only parsing, refined)
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";
import { jsonExtract } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------- types ----------------
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
  return (
    (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | undefined) || null
  );
}

/** Decode a very small subset of HTML entities (enough for titles/prices). */
function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Remove non-visible/low-signal blocks so the LLM focuses on product content.
 * Keep <title> and common meta tags for better naming.
 */
function stripNonVisible(html: string): string {
  return html
    // comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // scripts/styles/iframes/templates/svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");
}

/** Extract lightweight hints (still LLM-only final decision). */
function extractHints(html: string) {
  const lower = html.toLowerCase();

  const titleMatch = html.match(/<title[^>]*>([^<]{5,120})<\/title>/i);
  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']{5,160})["']/i);

  // Cheap signals for price-like tokens (₴/грн/uah) — not used as truth, just context
  const priceTokens = [] as string[];
  const priceRegex = /([0-9][0-9 ., ]{0,10})(?:₴|грн|uah)/giu;
  let m: RegExpExecArray | null;
  while ((m = priceRegex.exec(html))) {
    const raw = m[0]
      .replace(/\s+/g, " ")
      .replace(/&nbsp;/g, " ")
      .trim();
    if (raw.length <= 16) priceTokens.push(raw);
    if (priceTokens.length >= 10) break; // cap noise
  }

  // Availability cues
  const availabilityCues = [] as string[];
  const cueList = [
    "в наявності",
    "є в наявності",
    "готовий до відправлення",
    "in stock",
    "додати в кошик",
    "немає в наявності",
    "out of stock",
    "повідомити про наявність",
  ];
  for (const cue of cueList) {
    if (lower.includes(cue)) availabilityCues.push(cue);
  }

  // Tiny JSON-LD peek (do NOT parse deeply; still LLM decides)
  const jsonLd = html.match(/<script[^>]*application\/(ld\+json)[^>]*>([\s\S]{0,5000})<\/script>/i)?.[2];

  const lines = [
    titleMatch ? `title: ${decodeHtml(titleMatch[1]).trim()}` : null,
    ogTitle ? `og:title: ${decodeHtml(ogTitle[1]).trim()}` : null,
    priceTokens.length ? `priceHints: ${priceTokens.join(" | ")}` : null,
    availabilityCues.length ? `availabilityHints: ${availabilityCues.join(" | ")}` : null,
    jsonLd ? `jsonld: ${jsonLd.slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return lines;
}

// ---------------- LLM-only extract ----------------
async function llmExtractAll(
  html: string,
  url?: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const hints = extractHints(html);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { anyOf: [{ type: "string" }, { type: "null" }] },
      price: { anyOf: [{ type: "number" }, { type: "null" }] },
      availability: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    },
    required: ["name", "price", "availability"],
  } as const;

  const system = [
    "You are an expert parser of e‑commerce product pages.",
    "Return STRICT JSON ONLY, with exactly these keys: {name, price, availability}.",
    "If unknown, return null (not a string).",
    "Decide based ONLY on the provided content (HTML + small hint block).",
    // Disambiguation rules
    "PRICE rules:",
    "- Prefer the current product price in UAH (грн, ₴, UAH).",
    "- Ignore crossed‑out/old prices, ranges, per‑installment, per‑unit when not the main card price.",
    "- If multiple numbers appear, choose the one closest to buy/stock controls or clearly labeled as price.",
    "- Return a NUMBER (no currency symbol, no separators). Use dot as decimal; round if the site shows whole UAH.",
    "AVAILABILITY rules:",
    "- availability=true if page clearly indicates in stock / add to cart visible / ready to ship.",
    "- availability=false if out of stock / notify me / temporarily unavailable.",
    "- else null.",
    "NAME rules:",
    "- Use the product title of THIS page (not category, not brand-only, not breadcrumbs).",
    "- Prefer clean human-readable title (strip trailing shop branding).",
  ].join("\n");

  const user = [
    "OUTPUT: JSON with EXACT keys {name, price, availability}.",
    url ? `URL: ${url}` : "",
    "HINTS (may include title/price/availability cues/JSON-LD — use as clues, not as truth):",
    hints,
    "HTML (clean subset):",
    html.slice(0, 90000),
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await jsonExtract<{
    name: string | null;
    price: number | null;
    availability: boolean | null;
  }>({ system, user, schema, temperature: 0 });

  // Post‑sanity: clamp absurd prices, coerce
  const normPrice =
    typeof out?.price === "number" && isFinite(out.price) && out.price > 0 && out.price < 500000
      ? Math.round(out.price)
      : null;

  return {
    name: out?.name ?? null,
    price: normPrice,
    availability: typeof out?.availability === "boolean" ? out.availability : null,
  };
}

// ---------------- fetch + parse ----------------
async function fetchAndParse(
  url: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "SAM-ProductMonitor/1.0 (+https://medem.ua)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
    const rawHtml = await r.text();
    const cleaned = stripNonVisible(rawHtml);
    const html = decodeHtml(cleaned);

    // First pass
    let parsed = await llmExtractAll(html, url);

    // Retry once with stricter directive if price missing; occasionally helps tricky pages
    if (parsed.price == null || parsed.name == null) {
      const focus = [
        "ВИЗНАЧ ЦІНУ в UAH біля кнопок купівлі або блоку ціни.",
        "ІГНОРУЙ старі/перекреслені/акційні ціни, обери активну.",
      ].join(" ");
      parsed = await llmExtractAll(`${focus}\n\n${html}`, url);
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
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
      <p className="text-sm opacity-70">
        LLM-only parsing: name, price, availability are extracted exclusively by the model (with focused hints).
      </p>

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
          <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">
            Refresh all (re-parse)
          </button>
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
              const priceText = row.price ? `₴${Number(row.price).toLocaleString("uk-UA")}` : "—";
              return (
                <tr key={row.id} className="bg-neutral-900/40 hover:bg-neutral-900">
                  <td className="px-3 py-2 align-top max-w-[520px]">
                    <a href={row.url} target="_blank" rel="noreferrer" className="underline break-all">
                      {row.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top max-w-[420px]" title={displayName}>
                    <div className="truncate">{displayName}</div>
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums">{priceText}</td>
                  <td className="px-3 py-2 align-top">
                    {row.availability === null ? (
                      "—"
                    ) : row.availability ? (
                      <span className="inline-flex items-center rounded-lg px-2 py-1 bg-green-600/20 text-green-300">
                        In stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-lg px-2 py-1 bg-red-600/20 text-red-300">
                        Out
                      </span>
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
        This page uses <code>jsonExtract</code> to parse all fields (LLM-only). Pre-hints are provided to increase accuracy without DOM logic.
      </div>
    </div>
  );
}
