// app/api/kanban/board/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();

  // 1) Забираємо (або створюємо) борд
  let boards = await sql/* sql */`
    SELECT id, name
    FROM kanban_boards
    ORDER BY id ASC
    LIMIT 1;
  `;

  if (!boards.length) {
    const created = await sql/* sql */`
      INSERT INTO kanban_boards(name)
      VALUES ('Tasks')
      RETURNING id, name;
    `;
    const boardId = created[0].id;

    await sql/* sql */`
      INSERT INTO kanban_columns (board_id, key, title, position) VALUES
      (${boardId}, 'todo',       'To do',       1),
      (${boardId}, 'inprogress', 'In progress', 2),
      (${boardId}, 'done',       'Done',        3),
      (${boardId}, 'blocked',    'Blocked',     4);
    `;

    boards = created;
  }

  const boardId = boards[0].id;

  // 2) Колонки
  const columns = await sql/* sql */`
    SELECT
      id,
      key,
      title,
      wip_limit AS "wipLimit",
      position
    FROM kanban_columns
    WHERE board_id = ${boardId}
    ORDER BY position;
  `;

  // 3) Таски — всі часові поля віддаємо як ISO-рядки (UTC)
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
           ELSE to_char(start_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "startAt",

      CASE WHEN due_at IS NULL THEN NULL
           ELSE to_char(due_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      END AS "dueAt",

      position,
      archived,

      -- важливо: ISO-рядок, а не epoch
      to_char(created_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      to_char(updated_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM kanban_tasks
    WHERE board_id = ${boardId}
      AND archived = false
    ORDER BY position, created_at;
  `;

  return Response.json({
    board: { id: boardId, name: boards[0].name, columns, tasks },
  });
}
