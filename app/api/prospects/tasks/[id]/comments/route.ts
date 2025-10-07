// app/api/prospects/tasks/[id]/comments/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

type Params = { params: { id: string } };

/* -------------------- POST: Add comment to prospect task -------------------- */
export async function POST(req: NextRequest, { params }: Params) {
  const taskId = Number(params.id);
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, author } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "Comment text is required" }, { status: 400 });
    }

    // Verify task exists and belongs to tenant
    const tasks = await sql`
      SELECT id FROM prospect_tasks
      WHERE id = ${taskId} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;

    if (!tasks.length) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await sql`
      INSERT INTO prospect_task_comments (task_id, author, text)
      VALUES (${taskId}, ${author || null}, ${text})
      RETURNING *;
    `;

    // Update task's updated_at timestamp
    await sql`
      UPDATE prospect_tasks SET updated_at = NOW() WHERE id = ${taskId};
    `;

    return NextResponse.json({ ok: true, comment: comments[0] }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/prospects/tasks/[id]/comments failed:", e);
    return NextResponse.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

