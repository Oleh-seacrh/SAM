export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { getSql, toPgTextArray } from "@/lib/db";

function statusFromKey(key: string): "Todo" | "In Progress" | "Done" | "Blocked" {
  const k = (key || "").toLowerCase();
  if (k === "inprogress") return "In Progress";
  if (k === "done") return "Done";
  if (k === "blocked") return "Blocked";
  return "Todo";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const id = Number(params.id);
  if (!id) return Response.json({ error: "Bad id" }, { status: 400 });

  const taskRows = await sql/* sql */`
    SELECT
      id,
      board_id        AS "boardId",
      column_id       AS "columnId",
      title, description, owner, priority, status,
      assignees, tags, progress,
      start_at        AS "startAt",
      due_at          AS "dueAt",
      position, archived,
      extract(epoch from created_at)*1000 AS "createdAt",
      extract(epoch from updated_at)*1000 AS "updatedAt"
    FROM kanban_tasks
    WHERE id=${id}
    LIMIT 1;
  `;
  if (!taskRows.length) return Response.json({ error: "Not found" }, { status: 404 });

  const comments = await sql/* sql */`
    SELECT
      id, author, body,
      extract(epoch from created_at)*1000 AS "createdAt"
    FROM kanban_comments
    WHERE task_id=${id}
    ORDER BY created_at ASC;
  `;

  return Response.json({ task: taskRows[0], comments });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const taskId = Number(params.id);
  if (!taskId) return Response.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  const cur = await sql/* sql */`SELECT board_id FROM kanban_tasks WHERE id=${taskId} LIMIT 1;`;
  if (!cur.length) return Response.json({ error: "Not found" }, { status: 404 });
  const boardId = cur[0].board_id;

  if (body.moveToColumnKey) {
    const cols = await sql/* sql */`SELECT id, key FROM kanban_columns WHERE board_id=${boardId};`;
    const col = cols.find((c: any) => c.key === String(body.moveToColumnKey).toLowerCase());
    if (!col) return Response.json({ error: "Bad column" }, { status: 400 });

    const nextPos = await sql/* sql */`
      SELECT COALESCE(MAX(position)+1, 0) AS pos
      FROM kanban_tasks
      WHERE board_id=${boardId} AND column_id=${col.id};
    `;
    const position = Number(nextPos?.[0]?.pos ?? 0);
    await sql/* sql */`
      UPDATE kanban_tasks
      SET column_id=${col.id}, status=${statusFromKey(col.key)}, position=${position}, updated_at=NOW()
      WHERE id=${taskId};
    `;
  }

  const patch: string[] = [];
  if (typeof body.title === "string")        patch.push(`title=${sql.escape(body.title)}`);
  if (typeof body.description === "string")  patch.push(`description=${sql.escape(body.description)}`);
  if (typeof body.owner === "string")        patch.push(`owner=${sql.escape(body.owner)}`);
  if (["Low","Normal","High","Urgent"].includes(body.priority)) patch.push(`priority=${sql.escape(body.priority)}`);
  if (Number.isFinite(Number(body.progress))) patch.push(`progress=${Math.max(0,Math.min(100,Number(body.progress)))}`);
  if (Array.isArray(body.tags))       patch.push(`tags=${sql.raw(`${toPgTextArray(body.tags)}::text[]`)}`);
  if (Array.isArray(body.assignees))  patch.push(`assignees=${sql.raw(`${toPgTextArray(body.assignees)}::text[]`)}`);
  if (body.startAt)                   patch.push(`start_at=${sql.escape(new Date(body.startAt))}`);
  if (body.dueAt)                     patch.push(`due_at=${sql.escape(new Date(body.dueAt))}`);

  if (patch.length) {
    await sql/* sql */`UPDATE kanban_tasks SET ${sql.raw(patch.join(","))}, updated_at=NOW() WHERE id=${taskId};`;
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const taskId = Number(params.id);
  if (!taskId) return Response.json({ error: "Bad id" }, { status: 400 });

  await sql/* sql */`DELETE FROM kanban_tasks WHERE id=${taskId};`;
  return Response.json({ ok: true });
}
