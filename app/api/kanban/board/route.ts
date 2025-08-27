export const runtime = "nodejs";

import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();

  // Беремо першу (дефолтну) дошку — ми її створили міграцією як "Tasks"
  const boards = await sql/* sql */`
    SELECT id, name
    FROM kanban_boards
    ORDER BY id ASC
    LIMIT 1;
  `;
  if (!boards.length) {
    return Response.json({ error: "No board found" }, { status: 404 });
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
