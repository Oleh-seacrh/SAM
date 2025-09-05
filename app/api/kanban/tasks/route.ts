// app/api/kanban/tasks/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* ---------- helpers ---------- */

// "ai, backend" | ["ai","backend"] -> "ai,backend" (без пробілів) або null
function normalizeTags(input: unknown): string | null {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const flat = input.map((v) => String(v).trim()).filter(Boolean).join(",");
    return flat || null;
  }
  const s = String(input)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .join(",");
  return s || null;
}

// Пробуємо перетворити будь-що у ISO-дату або null
function toIsoDate(input: unknown): string | null {
  if (!input) return null;
  try {
    const s = String(input).trim();
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Повертає id колонки.
 * Працює зі схемами де поле може називатись name/title/label — або взагалі не передається.
 * Якщо нічого не знайшли — просто беремо першу колонку (LIMIT 1) без ORDER BY,
 * щоб не натикатись на неіснуючі стовпці.
 */
async function resolveColumnId(sql: any, body: any): Promise<string | null> {
  if (body?.column_id) return String(body.column_id);

  const wanted = body?.column ? String(body.column).trim().toLowerCase() : "";

  if (wanted) {
    // 1) спроба по "name"
    try {
      const r = (await sql/*sql*/`
        SELECT id FROM kanban_columns
        WHERE lower(name) = ${wanted}
        LIMIT 1;
      `) as Array<{ id: string }>;
      if (r?.length) return r[0].id;
    } catch {
      // ігноруємо — колонки name може не бути
    }

    // 2) спроба по "title"
    try {
      const r = (await sql/*sql*/`
        SELECT id FROM kanban_columns
        WHERE lower(title) = ${wanted}
        LIMIT 1;
      `) as Array<{ id: string }>;
      if (r?.length) return r[0].id;
    } catch {}

    // 3) спроба по "label"
    try {
      const r = (await sql/*sql*/`
        SELECT id FROM kanban_columns
        WHERE lower(label) = ${wanted}
        LIMIT 1;
      `) as Array<{ id: string }>;
      if (r?.length) return r[0].id;
    } catch {}
  }

  // Fallback — просто беремо будь-яку колонку, без ORDER BY
  try {
    const r = (await sql/*sql*/`
      SELECT id
      FROM kanban_columns
      LIMIT 1;
    `) as Array<{ id: string }>;
    if (r?.length) return r[0].id;
  } catch {}

  return null;
}

/* ---------- GET /api/kanban/tasks ---------- */
/** Повертає список задач з назвою колонки (якщо у таблиці є поле name) */
export async function GET(_req: NextRequest) {
  const sql = getSql();
  try {
    const rows = await sql/*sql*/`
      SELECT
        t.id,
        t.title,
        t.owner,
        t.priority,
        t.column_id,
        c.name AS column_name,
        t.due_date,
        t.tags,
        t.created_at,
        t.updated_at
      FROM kanban_tasks t
      LEFT JOIN kanban_columns c ON c.id = t.column_id
      ORDER BY t.created_at DESC;
    `;
    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("GET /api/kanban/tasks failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

/* ---------- POST /api/kanban/tasks ---------- */
/**
 * Створює задачу:
 * {
 *   title: string (required)
 *   owner?: string
 *   priority?: "low" | "normal" | "high" | string
 *   column?: string       // "To do" | "In progress" | ...
 *   column_id?: string    // або напряму ID
 *   due_date?: string     // будь-який парсабельний формат
 *   tags?: string | string[] // "ai, backend" або ["ai","backend"]
 * }
 */
export async function POST(req: NextRequest) {
  const sql = getSql();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Bad JSON body" },
      { status: 400 }
    );
  }

  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "Title is required" },
      { status: 400 }
    );
  }

  const owner = body?.owner != null ? String(body.owner) : null;
  const priority = (body?.priority || "normal") as string;
  const dueDateISO = toIsoDate(body?.due_date);
  const tagsCsv = normalizeTags(body?.tags);

  try {
    const columnId = await resolveColumnId(sql, body);
    if (!columnId) {
      return NextResponse.json(
        { ok: false, error: "No kanban columns found in DB" },
        { status: 400 }
      );
    }

    const rows = await sql/*sql*/`
      INSERT INTO public.kanban_tasks (
        title,
        owner,
        priority,
        column_id,
        due_date,
        tags,
        created_at,
        updated_at
      )
      VALUES (
        ${title},
        ${owner},
        ${priority},
        ${columnId},
        ${dueDateISO},
        CASE
          WHEN ${tagsCsv} IS NULL OR ${tagsCsv} = '' THEN NULL
          ELSE string_to_array(${tagsCsv}, ',')
        END,
        now(),
        now()
      )
      RETURNING *;
    `;

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/kanban/tasks failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}
