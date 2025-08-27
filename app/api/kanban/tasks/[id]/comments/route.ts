export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sql = getSql();
  const taskId = Number(params.id);
  if (!taskId) return Response.json({ error: "Bad id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const text = (body.body || "").toString().trim();
  if (!text) return Response.json({ error: "Empty body" }, { status: 400 });

  const author = typeof body.author === "string" ? body.author : "Me";

  const rows = await sql/* sql */`
    INSERT INTO kanban_comments(task_id, author, body)
    VALUES (${taskId}, ${author}, ${text})
    RETURNING id;
  `;
  return Response.json({ id: rows[0].id }, { status: 201 });
}
