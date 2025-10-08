// app/api/prospects/tasks/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

type Params = { params: { id: string } };

function statusByColKey(key: string): string {
  const map: Record<string, string> = {
    to_contact: "new",
    contacted: "in_progress",
    send_offer: "in_progress",
    waiting_reply: "waiting",
    negotiating: "negotiating",
    won: "done",
    lost: "closed",
  };
  return map[key] || "new";
}

/* -------------------- GET: Fetch prospect task details with comments -------------------- */
export async function GET(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    const tasks = await sql`
      SELECT * FROM prospect_tasks
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;

    if (!tasks.length) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await sql`
      SELECT id, task_id, author, text, created_at
      FROM prospect_task_comments
      WHERE task_id = ${id}
      ORDER BY created_at ASC;
    `;

    return NextResponse.json({ task: tasks[0], comments });
  } catch (e: any) {
    console.error("GET /api/prospects/tasks/[id] failed:", e);
    return NextResponse.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

/* -------------------- PATCH: Update prospect task (move columns, update fields) -------------------- */
export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  console.log("[PATCH /api/prospects/tasks/[id]] taskId:", id, "tenantId:", tenantId);

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    console.log("[PATCH /api/prospects/tasks/[id]] payload:", payload);
    const { moveToColumnKey, owner, priority, dueAt, progress, status } = payload;

    // Verify task belongs to tenant
    const tasks = await sql`
      SELECT id FROM prospect_tasks
      WHERE id = ${id} AND tenant_id = ${tenantId}
      LIMIT 1;
    `;

    if (!tasks.length) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 1) Move to different column
    if (moveToColumnKey) {
      console.log("[PATCH] Moving to column:", moveToColumnKey);
      const columns = await sql`
        SELECT id FROM prospect_columns WHERE key = ${moveToColumnKey} LIMIT 1;
      `;
      
      console.log("[PATCH] Found columns:", columns.length);

      if (!columns.length) {
        console.error("[PATCH] Column not found:", moveToColumnKey);
        return NextResponse.json({ error: "Column not found" }, { status: 400 });
      }

      const colId = columns[0].id;
      const newStatus = statusByColKey(moveToColumnKey);
      console.log("[PATCH] Moving to columnId:", colId, "newStatus:", newStatus);

      // Update timestamps based on column
      console.log("[PATCH] Updating task to columnId:", colId, "status:", newStatus);
      
      if (moveToColumnKey === "contacted" || moveToColumnKey === "send_offer") {
        await sql`
          UPDATE prospect_tasks
          SET column_id = ${colId}, status = ${newStatus}, contacted_at = NOW(), updated_at = NOW()
          WHERE id = ${id};
        `;
      } else if (moveToColumnKey === "waiting_reply") {
        await sql`
          UPDATE prospect_tasks
          SET column_id = ${colId}, status = ${newStatus}, replied_at = NOW(), updated_at = NOW()
          WHERE id = ${id};
        `;
      } else if (moveToColumnKey === "won") {
        await sql`
          UPDATE prospect_tasks
          SET column_id = ${colId}, status = ${newStatus}, won_at = NOW(), progress = 100, updated_at = NOW()
          WHERE id = ${id};
        `;
      } else if (moveToColumnKey === "lost") {
        await sql`
          UPDATE prospect_tasks
          SET column_id = ${colId}, status = ${newStatus}, lost_at = NOW(), updated_at = NOW()
          WHERE id = ${id};
        `;
      } else {
        await sql`
          UPDATE prospect_tasks
          SET column_id = ${colId}, status = ${newStatus}, updated_at = NOW()
          WHERE id = ${id};
        `;
      }
      
      console.log("[PATCH] Task updated successfully");
    }

    // 2) Update individual fields
    if (owner !== undefined) {
      await sql`UPDATE prospect_tasks SET owner = ${owner}, updated_at = NOW() WHERE id = ${id};`;
    }
    if (priority !== undefined) {
      await sql`UPDATE prospect_tasks SET priority = ${priority}, updated_at = NOW() WHERE id = ${id};`;
    }
    if (dueAt !== undefined) {
      await sql`UPDATE prospect_tasks SET due_at = ${dueAt}, updated_at = NOW() WHERE id = ${id};`;
    }
    if (progress !== undefined) {
      await sql`UPDATE prospect_tasks SET progress = ${progress}, updated_at = NOW() WHERE id = ${id};`;
    }
    if (status !== undefined) {
      await sql`UPDATE prospect_tasks SET status = ${status}, updated_at = NOW() WHERE id = ${id};`;
    }

    // Return updated task
    const updated = await sql`
      SELECT * FROM prospect_tasks WHERE id = ${id} LIMIT 1;
    `;

    return NextResponse.json({ ok: true, task: updated[0] });
  } catch (e: any) {
    console.error("PATCH /api/prospects/tasks/[id] failed:", e);
    return NextResponse.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

/* -------------------- DELETE: Archive prospect task -------------------- */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number(params.id);
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    await sql`
      UPDATE prospect_tasks
      SET archived = true, updated_at = NOW()
      WHERE id = ${id} AND tenant_id = ${tenantId};
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/prospects/tasks/[id] failed:", e);
    return NextResponse.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

