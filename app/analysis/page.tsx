// app/analysis/page.tsx
// Product Monitor (LLM-only parser) for SAM
// - Uses your existing LLM helper from "@/lib/llm" (jsonExtract) — no new clients
// - Stores into Neon table: analysis_products (url, name, price, availability)
// - Simple UI: add URL, list, refresh one/all
// - No DDL here (you said you'll create the table yourself)

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";
import { jsonExtract } from "@/lib/llm"; // <- use your existing helper

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- Types ----------
type Row = {
  id: string;
  tenant_id: string | null;
  url: string;
  name: string | null;
  price: string | null; // numeric comes back as string from Neon
  availability: boolean | null;
  updated_at: string | null;
};

// ---------- Utils ----------
async function getTenantId(): Promise<string | null> {
  // fallbacks so prod doesn't crash if there's no session
  return (await getTenantIdFromSession()) || (process.env.TENANT_ID as string | undefined) || null;
}

function decodeHtmlEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ---------- LLM extraction (through your helper) ----------
async function llmExtract(html: string, url?: string): Promise<{
  name: string | null;
  price: number | null;
  availability: boolean | null;
}> {
  // JSON Schema that your `jsonExtract` accepts
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

  const user = [
    "Return JSON with EXACT keys: name (string|null), price (number|null), availability (true|false|null).",
    "Normalize price to dot-decimal if needed (e.g., '1 299,00' -> 1299.00).",
    "If a field is not found, use null.",
    url ? `URL: ${url}` : "",
    "HTML:",
    html.slice(0, 18000), // keep the prompt efficient
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
    // model/provider if your helper supports it:
    // model: "gpt-4o-mini",
    // provider: "openai",
  });

  return {
    name: out?.name ?? null,
    price: typeof out?.price === "number" ? out!.price : null,
    availability:
      typeof out?.availability === "boolean" ? out!.availability : null,
  };
}

// ---------- Fetch page & parse via LLM only ----------
async function fetchAndParse(url: string): Promise<{
  name: string | null;
  price: number | null;
  availability: boolean | null;
}> {
  const r = await fetch(url, {
    headers: { "User-Agent": "SAM-ProductMonitor/1.0" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
  const html = await r.text();

  const ai = await llmExtract(html, url);

  const name =
    ai.name && typeof ai.name === "string" ? decodeHtmlEntities(ai.name) : ai.name;
  const price = ai.price ?? null;
  const availability = ai.availability ?? null;

  return { name, price, availability };
}

// ---------- DB helpers ----------
async function listProducts(): Promise<Row[]> {
  const sql = getSql();
  const tenantId = await getTenantId();
  const rows = await sql<Row[]>`
    SELECT
      id,
      tenant_id,
      url,
      name,
      price::text AS price,
      availability,
      updated_at::text AS updated_at
    FROM analysis_products
    WHERE (${tenantId} IS NULL AND tenant_id IS NULL) OR tenant_id = ${tenantId}
    ORDER BY updated_at DESC NULLS LAST, url ASC
  `;
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

// ---------- Server Actions ----------
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

// ---------- Page ----------
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
        LLM-only product monitor. Adds/refreshes URL → saves{" "}
        <code>name</code>, <code>price</code>, <code>availability</code> in
        Neon.
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
        <button className="rounded-xl px-4 py-2 bg-white text-black hover:opacity-90">
          Add
        </button>
      </form>

      {/* Bulk refresh */}
      <form action={refreshAllAction}>
        <button className="rounded-xl px-4 py-2 border border-neutral-700 hover:bg-neutral-800">
          Refresh all
        </button>
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
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center opacity-60"
                >
                  No items yet. Add a product URL above.
                </td>
              </tr>
            )}
            {items.map((row) => (
              <tr
                key={row.id}
                className="bg-neutral-900/40 hover:bg-neutral-900"
              >
                <td className="px-3 py-2 align-top max-w-[380px]">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline break-all"
                  >
                    {row.url}
                  </a>
                </td>
                <td
                  className="px-3 py-2 align-top max-w-[320px]"
                  title={row.name ?? undefined}
                >
                  <div className="truncate">{row.name ?? "—"}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  {row.price ?? "—"}
                </td>
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
                  {row.updated_at
                    ? new Date(row.updated_at).toLocaleString()
                    : "—"}
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
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs opacity-60">
        Parser uses your <code>jsonExtract</code> helper under{" "}
        <code>@/lib/llm</code>. Ensure your provider/model is configured there.
      </div>
    </div>
  );
}
