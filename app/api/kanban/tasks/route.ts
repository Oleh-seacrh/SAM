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

export async function POST(req: NextRequest) {
  const sql = getSql();
  const body = await req.json().catch(() => ({}));

  const title = (body.title || "").toString().trim();
  if (!title) return Response.json({ error: "Title is required" }, { status: 400 });

  const boards = await sql/* sql */`SELECT id FROM kanban_boards ORDER BY id ASC LIMIT 1;`;
  if (!boards.length) return Response.json({ error: "No board" }, { status: 400 });
  const boardId = boards[0].id;

  const cols = await sql/* sql */`SELECT id, key FROM kanban_columns WHERE board_id=${boardId};`;
  const wantKey = (body.columnKey || "todo").toString().toLowerCase();
  const col = cols.find((c: any) => c.key === wantKey) || cols.find((c: any) => c.key === "todo") || cols[0];
  const columnId = col.id;

  const nextPos = await sql/* sql */`
    SELECT COALESCE(MAX(position)+1, 0) AS pos
    FROM kanban_tasks
    WHERE board_id=${boardId} AND column_id=${columnId};
  `;
  const position = Number(nextPos?.[0]?.pos ?? 0);

  const priority = ["Low","Normal","High","Urgent"].includes(body.priority) ? body.priority : "Normal";
  const progress = Number.isFinite(Number(body.progress)) ? Math.max(0, Math.min(100, Number(body.progress))) : 0;

  const assignees = Array.isArray(body.assignees) ? body.assignees : [];
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const startAt = body.startAt ? new Date(body.startAt) : null;
  const dueAt   = body.dueAt   ? new Date(body.dueAt)   : null;
  const owner   = typeof body.owner === "string" ? body.owner : null;

  const rows = await sql/* sql */`
    INSERT INTO kanban_tasks (
      board_id, column_id, title, description,
      owner, priority, status, assignees, tags,
      progress, start_at, due_at, position, archived,
      created_at, updated_at
    ) VALUES (
      ${boardId}, ${columnId}, ${title}, ${body.description ?? null},
      ${owner}, ${priority}, ${statusFromKey(col.key)}, ${toPgTextArray(assignees)}::text[], ${toPgTextArray(tags)}::text[],
      ${progress}, ${startAt}, ${dueAt}, ${position}, false,
      NOW(), NOW()
    )
    RETURNING id;
  `;

  return Response.json({ id: rows[0].id }, { status: 201 });
}
