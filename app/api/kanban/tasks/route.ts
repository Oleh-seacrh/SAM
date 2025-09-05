export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

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

  // На крайній випадок — створимо дефолтну дошку
  const ins = (await sql/*sql*/`
    INSERT INTO kanban_boards (name)
    VALUES ('Tasks')
    RETURNING id;
  `) as Array<{ id: number }>;
  return ins[0].id;
}

/** Визначає column_id:
 *  - якщо прийшов column_id — беремо його
 *  - якщо прийшов column_key ("todo"|"inprogress"|...) — шукаємо по key
 *  - якщо прийшов column_title або column ("To do"|"In progress"|...) — шукаємо по title (без регістру)
 *  - інакше – перша колонка на дошці
 */
async function resolveColumnId(sql: any, body: any, boardId: number): Promise<number | null> {
  if (body?.column_id) return Number(body.column_id);

  // за key (todo|inprogress|done|blocked)
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

  // за title або column
  const titleLike =
    body?.column_title ?? body?.column ?? null;
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

  // fallback — перша колонка на дошці за position
  const anyCol = (await sql/*sql*/`
    SELECT id
    FROM kanban_columns
    WHERE board_id = ${boardId}
    ORDER BY position NULLS LAST, id
    LIMIT 1;
  `) as Array<{ id: number }>;
  return anyCol?.[0]?.id ?? null;
}

/* ========================= GET ========================= */
/** GET /api/kanban/tasks — повертає список задач з даними колонки */
export async function GET(_req: NextRequest) {
  const sql = getSql();
  try {
    // беремо першу дошку (або можна фільтрувати по query, якщо додасте)
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

/* ========================= POST ========================= */
/** POST /api/kanban/tasks
 * Body:
 *  {
 *    title: string (required)
 *    description?: string
 *    priority?: string        // "low" | "normal" | "high" | вільний текст
 *    status?: string          // вільний текст, напр. "open"
 *    board_id?: number
 *    column_id?: number
 *    column_key?: string      // "todo" | "inprogress" | "done" | "blocked"
 *    column_title?: string    // "To do" | "In progress" | ...
 *    column?: string          // те саме що column_title (для сумісності з UI)
 *
 *    // owner, due_date, tags — ігноруємо (їх немає у схемі kanban_tasks)
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
  const priority = body?.priority != null ? String(body.priority) : "normal";
  const status = body?.status != null ? String(body.status) : "open";

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
    console.error("POST /api/kanban/tasks failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}
