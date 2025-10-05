// app/analysis/page.tsx
// Product Monitor (LLM-only) for SAM
// - "Reload list" лише перечитує з БД і оновлює таблицю (без парсингу)
// - "Refresh all (re-parse)" фетчить HTML і просить LLM (через твій jsonExtract) витягнути name/price/availability
// - Тимчасово показуємо всі записи (без фільтра по tenant_id), щоб ти бачив результат
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
  price: string | null; // numeric з Neon приходить рядком
  availability: boolean | null;
  updated_at: string | null;
};

// ---------------- helpers ----------------
async function getTenantId(): Promise<string | null> {
  return (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | undefined) || null;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// --- детерміновані пост-перевірки, щоб LLM не «вигадувала» ---
const POS_WORDS = [
  "в наявності",
  "є в наявності",
  "in stock",
  "available",
  "додати в кошик",
  "add to cart",
];
const NEG_WORDS = [
  "немає в наявності",
  "тимчасово немає в наявності",
  "відсутній",
  "out of stock",
  "sold out",
  "під замовлення",
];

function normText(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function validatePriceInHtml(html: string, price: number | null): number | null {
  if (price == null) return null;
  const t = normText(html);
  const patterns = [
    new RegExp(`\\b${price.toFixed(2)}\\b`), // 2107.80
    new RegExp(`\\b${price.toFixed(1)}\\b`), // 2107.8
    new RegExp(`\\b${Math.round(price)}\\b`), // 2108
  ];
  for (const rx of patterns) if (rx.test(t)) return price;
  return null;
}

function detectAvailability(html: string): boolean | null {
  const t = normText(html);
  for (const w of POS_WORDS) if (t.includes(w)) return true;
  for (const w of NEG_WORDS) if (t.includes(w)) return false;
  return null;
}

// ---------------- LLM через твій jsonExtract ----------------
async function llmExtract(
  html: string,
  url?: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  // JSON Schema для твого jsonExtract
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

  const system =
    "You extract structured data from a single e-commerce product page and return STRICT JSON only.";

  // посилили інструкції під акційні/перекреслені ціни та не-вгадувати значення
  const user = [
    "OUTPUT: JSON with EXACT keys: name (string|null), price (number|null), availability (true|false|null).",
    "HARD RULES:",
    "- Return ONLY values that visibly appear in the provided HTML.",
    "- If you are NOT CERTAIN a value exists in the HTML, return null (do NOT guess).",
    "PRICE RULES:",
    "- If multiple prices exist (old crossed-out vs discounted), return the CURRENT/ACTIVE price.",
    "- Ignore any price inside <del> tags or elements with class/id containing: old, strike, crossed, was, regular, rrp.",
    "- Prefer price near keywords: 'Ціна', 'Цена', 'price', or near purchase buttons: 'Додати в кошик' / 'Add to cart'.",
    "- Normalize to dot-decimal number (e.g., '1 299,00' -> 1299.00). Do NOT include currency symbols.",
    "AVAILABILITY RULES:",
    "- availability=true only if HTML shows it can be purchased (e.g., 'В наявності', 'Є в наявності', 'In stock', 'Available', or a visible purchase button).",
    "- availability=false if HTML has 'Немає в наявності', 'Тимчасово немає в наявності', 'Out of stock', 'Sold out', 'Під замовлення'.",
    "- If unclear, set availability to null.",
    "NAME RULES:",
    "- Use the product title/name (not breadcrumbs or navigation).",
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
    price: typeof out?.price === "number" ? out!.price : null,
    availability: typeof out?.availability === "boolean" ? out!.availability : null,
  };
}

// ---------------- fetch + parse через LLM (з валідаціями) ----------------
async function fetchAndParse(
  url: string
): Promise<{ name: string | null; price: number | null; availability: boolean | null }> {
  const r = await fetch(url, {
    headers: { "User-Agent": "SAM-ProductMonitor/1.0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);

  // нормалізуємо NBSP та подібні пробіли — це допомагає і LLM, і детермінаціям нижче
  const rawHtml = await r.text();
  const html = rawHtml.replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ");

  // 1) LLM
  const ai = await llmExtract(html, url);

  // 2) Детерміновані перевірки/перекриття
  const detectedAvail = detectAvailability(html);
  const safeAvailability = detectedAvail !== null ? detectedAvail : ai.availability;

  const safePrice = validatePriceInHtml(html, ai.price);

  const name = ai.name ? decodeHtml(ai.name) : null;

  return { name, price: safePrice, availability: safeAvailability ?? null };
}

// ---------------- DB ----------------
async function listProducts(): Promise<Row[]> {
  const sql = getSql();
  // Тимчасово без фільтра по tenant_id — показуємо все, щоб не було «порожньої» сторінки
  return await sql<Row[]>`
    SELECT
      id,
      tenant_id,
      url,
      name,
      price::text AS price,
      availability,
      updated_at::text AS updated_at
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
    RETURNING
      id,
      tenant_id,
      url,
      name,
      price::text AS price,
      availability,
      updated_at::text AS updated_at
  `;
  return rows[0];
}

// ---------------- Server Actions ----------------
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
                  <td className="px-3 py-2 align-top max-w-[520px]">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline break-all"
                    >
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
