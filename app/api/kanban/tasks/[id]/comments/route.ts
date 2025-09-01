// app/api/kanban/tasks/[id]/comments/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { getSql } from "@/lib/db";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const sql = getSql();
  const taskId = Number(params.id);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const text = (body?.body ?? "").toString().trim();
  const author = (body?.author ?? null) as string | null;

  if (!taskId || !text) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const rows = await sql/* sql */`
    INSERT INTO kanban_comments (task_id, author, body)
    VALUES (${taskId}, ${author}, ${text})
    RETURNING
      id,
      author,
      body,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt";
  `;

  return Response.json({ comment: rows[0] });
}
