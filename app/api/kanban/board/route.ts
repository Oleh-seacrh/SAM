export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();

  // 1) Беремо першу дошку (дефолтну)
  let boards = await sql/* sql */`
    SELECT id, name
    FROM kanban_boards
    ORDER BY id ASC
    LIMIT 1;
  `;

  // 2) Якщо дошки немає — створюємо її та стандартні колонки
  if (!boards.length) {
    const created = await sql/* sql */`
      INSERT INTO kanban_boards(name) VALUES('Tasks') RETURNING id, name;
    `;
    const boardId = created[0].id;

    await sql/* sql */`
      INSERT INTO kanban_columns (board_id, key, title, position)
      VALUES
        (${boardId}, 'todo',       'To do',       1),
        (${boardId}, 'inprogress', 'In progress', 2),
        (${boardId}, 'done',       'Done',        3),
        (${boardId}, 'blocked',    'Blocked',     4);
    `;

    boards = created;
  }

  const boardId = boards[0].id;

  const columns = await sql/* sql */`
    SELECT id, key, title, wip_limit AS "wipLimit", position
    FROM kanban_columns
    WHERE board_id=${boardId}
    ORDER BY position;
  `;

  const tasks = await sql/* sql */`
    SELECT
      id,
      board_id        AS "boardId",
      column_id       AS "columnId",
      title,
      description,
      priority,
      status,
      assignees,
      tags,
      progress,
      start_at        AS "startAt",
      due_at          AS "dueAt",
      position,
      archived,
      extract(epoch from created_at)*1000  AS "createdAt",
      extract(epoch from updated_at)*1000  AS "updatedAt"
    FROM kanban_tasks
    WHERE board_id=${boardId} AND archived=false
    ORDER BY position, created_at;
  `;

  return Response.json({
    board: { id: boardId, name: boards[0].name, columns, tasks },
  });
}
