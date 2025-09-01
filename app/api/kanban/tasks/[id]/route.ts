// app/api/kanban/tasks/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { getSql } from "@/lib/db";

type Params = { params: { id: string } };

// ---- helpers ----
function statusByColKey(key: string | null | undefined): string {
  switch (key) {
    case "inprogress": return "In Progress";
    case "done": return "Done";
    case "blocked": return "Blocked";
    default: return "Todo";
  }
}

// ---- GET: деталі таски + коменти ----
export async function GET(_req: Request, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();

  const tasks = await sql/* sql */`
    SELECT
      id,
      board_id  AS "boardId",
      column_id AS "columnId",
      title,
      description,
      owner,
      priority,
      status,
      assignees,
      tags,
      progress,
      CASE WHEN start_at IS NULL THEN NULL
           ELSE to_char(start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "startAt",
      CASE WHEN due_at IS NULL THEN NULL
           ELSE to_char(due_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "dueAt",
      position,
      archived,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM kanban_tasks
    WHERE id=${id}
    LIMIT 1;
  `;
  if (!tasks.length) {
    return new Response(JSON.stringify({ error: "Task not found" }), { status: 404 });
  }

  const comments = await sql/* sql */`
    SELECT
      id,
      author,
      body,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM kanban_comments
    WHERE task_id=${id}
    ORDER BY created_at DESC;
  `;

  return Response.json({ task: tasks[0], comments });
}

// ---- PATCH: оновлення полів / переміщення колонки ----
export async function PATCH(req: Request, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    // порожнє тіло — не критично
  }

  const { moveToColumnKey, owner, priority, dueAt } = payload ?? {};

  // 1) Переміщення між колонками (за key)
  if (moveToColumnKey) {
    const columns = await sql/* sql */`
      SELECT id FROM kanban_columns WHERE key=${moveToColumnKey} LIMIT 1;
    `;
    if (!columns.length) {
      return new Response(JSON.stringify({ error: "Column not found" }), { status: 400 });
    }
    const colId = columns[0].id;
    const newStatus = statusByColKey(moveToColumnKey);

    await sql/* sql */`
      UPDATE kanban_tasks
      SET column_id=${colId},
          status=${newStatus},
          updated_at=NOW()
      WHERE id=${id};
    `;
  }

  // 2) Окремі оновлення: owner / priority / due_at (будь-яка комбінація)
  //    Робимо окремими апдейтами — просто і надійно.
  if (owner !== undefined) {
    await sql/* sql */`
      UPDATE kanban_tasks
      SET owner=${owner}, updated_at=NOW()
      WHERE id=${id};
    `;
  }
  if (priority !== undefined) {
    await sql/* sql */`
      UPDATE kanban_tasks
      SET priority=${priority}, updated_at=NOW()
      WHERE id=${id};
    `;
  }
  if (dueAt !== undefined) {
    // ISO строка або null — Postgres з'їсть
    await sql/* sql */`
      UPDATE kanban_tasks
      SET due_at=${dueAt}, updated_at=NOW()
      WHERE id=${id};
    `;
  }

  // 3) Повертаємо оновлену таску (в ISO-датах)
  const tasks = await sql/* sql */`
    SELECT
      id,
      board_id  AS "boardId",
      column_id AS "columnId",
      title,
      description,
      owner,
      priority,
      status,
      assignees,
      tags,
      progress,
      CASE WHEN start_at IS NULL THEN NULL
           ELSE to_char(start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "startAt",
      CASE WHEN due_at IS NULL THEN NULL
           ELSE to_char(due_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "dueAt",
      position,
      archived,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM kanban_tasks
    WHERE id=${id}
    LIMIT 1;
  `;
  return Response.json({ task: tasks[0] });
}

// ---- DELETE: видалення таски ----
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();

  await sql/* sql */`DELETE FROM kanban_comments WHERE task_id=${id};`;
  await sql/* sql */`DELETE FROM kanban_tasks WHERE id=${id};`;

  return Response.json({ ok: true });
}
