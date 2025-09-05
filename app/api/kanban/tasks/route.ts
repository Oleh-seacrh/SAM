export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* -------------------- helpers -------------------- */

type Sql = ReturnType<typeof getSql>;

function normalizePriority(v: unknown): "Low" | "Normal" | "High" | "Urgent" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "low") return "Low";
  if (s === "high") return "High";
  if (s === "urgent") return "Urgent";
  return "Normal";
}

function statusFromColumnTitle(title: string): "Todo" | "In Progress" | "Done" | "Blocked" {
  const s = title.trim().toLowerCase();
  if (s.includes("progress")) return "In Progress";
  if (s.includes("done")) return "Done";
  if (s.includes("block")) return "Blocked";
  return "Todo";
}

function toIsoDate(input: unknown): string | null {
  if (!input) return null;
  try {
    const d = new Date(String(input));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/** "ai, backend" | ["ai","backend"] -> TEXT[] | null */
function toTextArray(input: unknown): string[] | null {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const arr = input.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  const s = String(input);
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

/** Повертає id борду "Tasks" або 1, або значення з body */
async function resolveBoardId(sql: Sql, body: any): Promise<number> {
  if (body?.board_id != null) return Number(body.board_id);

  const r =
    (await sql/*sql*/`
      SELECT id FROM kanban_boards
      WHERE lower(name) = 'tasks'
      ORDER BY id
      LIMIT 1;
    `) as Array<{ id: number }>;
  if (r?.length) return r[0].id;

  // fallback – частіше за все це 1
  return 1;
}

/** column_id по id / key / title */
async function resolveColumnId(sql: Sql, boardId: number, body: any): Promise<number | null> {
  if (body?.column_id != null) return Number(body.column_id);

  const raw = String(body?.column ?? body?.column_key ?? body?.column_title ?? "").trim();
  if (!raw) {
    // перша колонка борду
    const anyCol =
      (await sql/*sql*/`
        SELECT id
        FROM kanban_columns
        WHERE board_id = ${boardId}
        ORDER BY position, id
        LIMIT 1;
      `) as Array<{ id: number }>;
    return anyCol?.[0]?.id ?? null;
  }

  // пробуємо знайти за key або за title
  const q = raw.toLowerCase();
  const rows =
    (await sql/*sql*/`
      SELECT id
      FROM kanban_columns
      WHERE board_id = ${boardId}
        AND (lower(key) = ${q} OR lower(title) = ${q})
      LIMIT 1;
    `) as Array<{ id: number }>;

  if (rows?.length) return rows[0].id;

  // fallback: перша колонка
  const anyCol =
    (await sql/*sql*/`
      SELECT id FROM kanban_columns
      WHERE board_id = ${boardId}
      ORDER BY position, id
      LIMIT 1;
    `) as Array<{ id: number }>;
  return anyCol?.[0]?.id ?? null;
}

/* -------------------- GET /api/kanban/tasks -------------------- */
/** Повертає задачі + назви колонки та борду (для фронту зручно). */
export async function GET(_req: NextRequest) {
  const sql = getSql();
  try {
    const rows =
      (await sql/*sql*/`
        SELECT
          t.id,
          t.board_id,
          b.name  AS board_name,
          t.column_id,
          c.key   AS column_key,
          c.title AS column_title,
          t.title,
          t.description,
          t.priority,
          t.status,
          t.owner,
          t.assignees,
          t.tags,
          t.progress,
          t.start_at,
          t.due_at,
          t.position,
          t.archived,
          t.created_at,
          t.updated_at
        FROM kanban_tasks t
        LEFT JOIN kanban_columns c ON c.id = t.column_id
        LEFT JOIN kanban_boards  b ON b.id = t.board_id
        WHERE t.archived = FALSE
        ORDER BY t.created_at DESC, t.id DESC;
      `) as any[];

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error("GET /api/kanban/tasks failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

/* -------------------- POST /api/kanban/tasks -------------------- */
/** Створює задачу. Приймає тіло, сумісне з вашим UI:
 * {
 *   title: string (required)
 *   owner?: string
 *   priority?: "low|normal|high|urgent"
 *   column? | column_id? | column_key? | column_title?
 *   description?: string
 *   due_at? | due_date?: string (будь-який парсабельний)
 *   tags?: string | string[]   // "ai, backend"
 *   assignees?: string | string[]
 *   board_id?: number          // якщо не вказано — "Tasks" або 1
 * }
 */
export async function POST(req: NextRequest) {
  const sql = getSql();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON body" }, { status: 400 });
  }

  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });

  const owner = body?.owner != null ? String(body.owner) : null;
  const priority = normalizePriority(body?.priority);
  const description = body?.description != null ? String(body.description) : null;

  // приймаємо і due_at, і due_date
  const dueAtISO = toIsoDate(body?.due_at ?? body?.due_date);
  const tagsArr = toTextArray(body?.tags);
  const assigneesArr = toTextArray(body?.assignees);

  try {
    const boardId = await resolveBoardId(sql, body);
    const columnId = await resolveColumnId(sql, boardId, body);
    if (!columnId) {
      return NextResponse.json({ ok: false, error: "No column found" }, { status: 400 });
    }

    // Виводимо статус із назви колонки (якщо треба)
    const colRow =
      (await sql/*sql*/`
        SELECT title FROM kanban_columns WHERE id = ${columnId} LIMIT 1;
      `) as Array<{ title: string }>;
    const computedStatus = statusFromColumnTitle(colRow?.[0]?.title ?? "To do");

    const rows =
      (await sql/*sql*/`
        INSERT INTO kanban_tasks (
          board_id,
          column_id,
          title,
          description,
          priority,
          status,
          owner,
          assignees,
          tags,
          due_at
        )
        VALUES (
          ${boardId},
          ${columnId},
          ${title},
          ${description},
          ${priority},
          ${computedStatus},
          ${owner},
          ${assigneesArr},
          ${tagsArr},
          ${dueAtISO}
        )
        RETURNING *;
      `) as any[];

    // повернемо також читаємі назви
    const [task] = rows;
    const enriched =
      (await sql/*sql*/`
        SELECT
          t.*,
          c.key   AS column_key,
          c.title AS column_title,
          b.name  AS board_name
        FROM kanban_tasks t
        LEFT JOIN kanban_columns c ON c.id = t.column_id
        LEFT JOIN kanban_boards  b ON b.id = t.board_id
        WHERE t.id = ${task.id}
        LIMIT 1;
      `) as any[];

    return NextResponse.json({ ok: true, data: enriched?.[0] ?? task }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/kanban/tasks failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}
