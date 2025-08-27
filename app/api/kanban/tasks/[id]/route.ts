export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getSql, toPgTextArray } from "@/lib/db";

function statusFromKey(key: string): "Todo" | "In Progress" | "Done" | "Blocked" {
  const k = (key || "").toLowerCase();
  if (k === "inprogress") return "In Progress";
  if (k === "done") return "Done";
  if (k === "blocked") return "Blocked";
  return "Todo";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const taskId = Number(params.id);
  if (!taskId) return Response.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Отримаємо дошку/поточну задачу
  const cur = await sql/* sql */`
    SELECT board_id, column_id FROM kanban_tasks WHERE id=${taskId} LIMIT 1;
  `;
  if (!cur.length) return Response.json({ error: "Not found" }, { status: 404 });
  const boardId = cur[0].board_id;

  let columnId: number | null = null;
  let status: "Todo" | "In Progress" | "Done" | "Blocked" | null = null;

  if (body.moveToColumnKey) {
    const cols = await sql/* sql */`
      SELECT id, key FROM kanban_columns WHERE board_id=${boardId};
    `;
    const col = cols.find((c: any) => c.key === String(body.moveToColumnKey).toLowerCase());
    if (!col) return Response.json({ error: "Bad column" }, { status: 400 });
    columnId = col.id;
    status = statusFromKey(col.key);

    // обчислюємо позицію внизу колонки
    const nextPos = await sql/* sql */`
      SELECT COALESCE(MAX(position)+1, 0) AS pos
      FROM kanban_tasks
      WHERE board_id=${boardId} AND column_id=${columnId};
    `;
    const position = Number(nextPos?.[0]?.pos ?? 0);
    await sql/* sql */`
      UPDATE kanban_tasks
      SET column_id=${columnId}, status=${status}, position=${position}, updated_at=NOW()
      WHERE id=${taskId};
    `;
  }

  // звичайні поля (опційно)
  const patchFields: string[] = [];
  if (typeof body.title === "string")     patchFields.push(`title=${sql.escape(body.title)}`);
  if (typeof body.description === "string") patchFields.push(`description=${sql.escape(body.description)}`);
  if (["Low","Normal","High","Urgent"].includes(body.priority)) patchFields.push(`priority=${sql.escape(body.priority)}`);
  if (Number.isFinite(Number(body.progress))) patchFields.push(`progress=${Math.max(0,Math.min(100,Number(body.progress)))}`);
  if (Array.isArray(body.tags))        patchFields.push(`tags=${sql.raw(`${toPgTextArray(body.tags)}::text[]`)}`);
  if (Array.isArray(body.assignees))   patchFields.push(`assignees=${sql.raw(`${toPgTextArray(body.assignees)}::text[]`)}`);
  if (body.startAt)                    patchFields.push(`start_at=${sql.escape(new Date(body.startAt))}`);
  if (body.dueAt)                      patchFields.push(`due_at=${sql.escape(new Date(body.dueAt))}`);
  if (patchFields.length) {
    await sql/* sql */`
      UPDATE kanban_tasks
      SET ${sql.raw(patchFields.join(","))}, updated_at=NOW()
      WHERE id=${taskId};
    `;
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
