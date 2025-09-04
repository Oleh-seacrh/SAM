export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* ---------- helpers ---------- */

// "ai, backend" -> "ai,backend" (без пробілів) або null
function normalizeTags(input: unknown): string | null {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const flat = input
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join(",");
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
    // якщо прилітає щось типу "2025-10-09T00:00:00.000Z" — просто пропускаємо
    const s = String(input).trim();
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// Повертає id колонки. Приймає або column_id, або column (назву).
// Якщо назви немає в БД — поверне першу існуючу колонку.
async function resolveColumnId(sql: any, body: any): Promise<string | null> {
  if (body?.column_id) return String(body.column_id);

  if (body?.column) {
    const name = String(body.column).trim().toLowerCase();
    const rows = (await sql/*sql*/`
      SELECT id
      FROM kanban_columns
      WHERE lower(name) = ${name}
      LIMIT 1;
    `) as Array<{ id: string }>;
    if (rows?.length) return rows[0].id;
  }

  // fallback: перша доступна колонка (припускаємо, що вони є)
  const anyCol = (await sql/*sql*/`
    SELECT id
    FROM kanban_columns
    ORDER BY sort_order NULLS LAST, name
    LIMIT 1;
  `) as Array<{ id: string }>;
  return anyCol?.[0]?.id ?? null;
}

/* ---------- GET /api/kanban/tasks ---------- */
/** Повертає список задач з назвою колонки (для зручності фронту) */
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
/** Створює задачу. Приймає:
 * {
 *   title: string (required)
 *   owner?: string | number
 *   priority?: "low" | "normal" | "high" | string
 *   column?: string  // "To do" .. "Done"
 *   column_id?: string // альтернативно напряму ID
 *   due_date?: string // будь-який парсабельний формат
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

  // Валідація, нормалізація
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
