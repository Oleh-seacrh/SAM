export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

/* =============== helpers =============== */

// Приводимо до набору, який очікує БД: 'low' | 'normal' | 'urgent'
function normalizePriority(v: unknown): "low" | "normal" | "urgent" {
  const s = String(v ?? "").trim().toLowerCase();
  if (["low", "низький"].includes(s)) return "low";
  if (["urgent", "high", "високий", "срочно"].includes(s)) return "urgent";
  // normal за замовчуванням + синоніми
  if (["normal", "norm", "норм", "medium", "mid"].includes(s)) return "normal";
  return "normal";
}

// Якщо у вас є constraint на статус — теж у нижній регістр
function normalizeStatus(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return s || "open";
}

/** Повертає будь-який наявний board_id (або той, що в body). */
async function resolveBoardId(sql: any, body: any): Promise<number> {
  if (body?.board_id != null) return Number(body.board_id);

  const row = (await sql/*sql*/`
    SELECT id
    FROM kanban_boards
    ORDER BY id
    LIMIT 1;
  `) as Array<{ id: number }>;
  if (row?.length) return row[0].id;

  const ins = (await sql/*sql*/`
    INSERT INTO kanban_boards (name)
    VALUES ('Tasks')
    RETURNING id;
  `) as Array<{ id: number }>;
  return ins[0].id;
}

/** Визначає column_id:
 *  - column_id
 *  - column_key ("todo"|"inprogress"|"done"|"blocked")
 *  - column_title / column ("To do"|"In progress"|...)
 *  - або перша колонка дошки
 */
async function resolveColumnId(sql: any, body: any, boardId: number): Promise<number | null> {
  if (body?.column_id) return Number(body.column_id);

  if (body?.column_key) {
    const key = String(body.column_key).trim().toLowerCase();
    const rows = (await sql/*sql*/`
      SELECT id
      FROM kanban_columns
      WHERE board_id = ${boardId}
        AND lower(key) = ${key}
      LIMIT 1;
    `) as Array<{ id: number }>;
    if (rows?.length) return rows[0].id;
  }

  const titleLike = body?.column_title ?? body?.column ?? null;
  if (titleLike != null) {
    const t = String(titleLike).trim().toLowerCase();
    const rows = (await sql/*sql*/`
      SELECT id
      FROM kanban_columns
      WHERE board_id = ${boardId}
        AND lower(title) = ${t}
      LIMIT 1;
    `) as Array<{ id: number }>;
    if (rows?.length) return rows[0].id;
  }

  const anyCol = (await sql/*sql*/`
    SELECT id
    FROM kanban_columns
    WHERE board_id = ${boardId}
    ORDER BY position NULLS LAST, id
    LIMIT 1;
  `) as Array<{ id: number }>;
  return anyCol?.[0]?.id ?? null;
}

/* =============== GET =============== */
/** GET /api/kanban/tasks — список задач з даними колонки */
export async function GET(_req: NextRequest) {
  const sql = getSql();
  try {
    const boardRow = (await sql/*sql*/`
      SELECT id
      FROM kanban_boards
      ORDER BY id
      LIMIT 1;
    `) as Array<{ id: number }>;
    const boardId = boardRow?.[0]?.id ?? 1;

    const rows = await sql/*sql*/`
      SELECT
        t.id,
        t.board_id,
        t.column_id,
        t.title,
        t.description,
        t.priority,
        t.status,
        c.key   AS column_key,
        c.title AS column_title
      FROM kanban_tasks t
      LEFT JOIN kanban_columns c ON c.id = t.column_id
      WHERE t.board_id = ${boardId}
      ORDER BY t.id DESC;
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

/* =============== POST =============== */
/** POST /api/kanban/tasks
 * Body:
 *  {
 *    title: string (required)
 *    description?: string
 *    priority?: string               // 'low' | 'normal' | 'urgent' (+ синоніми)
 *    status?: string                 // 'open' ... (приводимо до lower case)
 *    board_id?: number
 *    column_id?: number
 *    column_key?: string             // 'todo' | 'inprogress' | 'done' | 'blocked'
 *    column_title?: string | column  // 'To do' | 'In progress' | ...
 *
 *    // owner/due_date/tags — ігноруємо (їх нема у таблиці)
 *  }
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
  if (!title) {
    return NextResponse.json({ ok: false, error: "Title is required" }, { status: 400 });
  }

  const description = body?.description != null ? String(body.description) : null;
  const priority = normalizePriority(body?.priority);
  const status = normalizeStatus(body?.status);

  try {
    const boardId = await resolveBoardId(sql, body);
    const columnId = await resolveColumnId(sql, body, boardId);
    if (!columnId) {
      return NextResponse.json(
        { ok: false, error: "No kanban columns found for this board" },
        { status: 400 }
      );
    }

    const rows = await sql/*sql*/`
      INSERT INTO kanban_tasks (
        board_id,
        column_id,
        title,
        description,
        priority,
        status
      )
      VALUES (
        ${boardId},
        ${columnId},
        ${title},
        ${description},
        ${priority},
        ${status}
      )
      RETURNING
        id, board_id, column_id, title, description, priority, status;
    `;

    return NextResponse.json({ ok: true, data: rows[0] }, { status: 201 });
  } catch (e: any) {
    // корисно бачити constraint у логах
    console.error("POST /api/kanban/tasks failed:", {
      message: e?.message,
      detail: e?.detail,
      code: e?.code,
      constraint: e?.constraint,
    });
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}
