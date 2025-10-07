export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getTenantIdFromSession } from "@/lib/auth";
import { getSql } from "@/lib/db";

/* ==================================================
 * GET /api/prompts - List all prompts for tenant
 * ================================================== */
export async function GET() {
  try {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 401 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, tenant_id, name, text, provider, model, created_at
      FROM prompts
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ prompts: rows });
  } catch (e: any) {
    console.error("/api/prompts GET error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch prompts" },
      { status: 500 }
    );
  }
}

/* ==================================================
 * POST /api/prompts - Create new prompt
 * Body: { name, text, provider, model? }
 * ================================================== */
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 401 });
    }

    const body = await req.json();
    const { name, text, provider, model } = body;

    if (!name?.trim() || !text?.trim() || !provider) {
      return NextResponse.json(
        { error: "Missing required fields: name, text, provider" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const id = crypto.randomUUID();
    const rows = await sql`
      INSERT INTO prompts (id, tenant_id, name, text, provider, model, created_at)
      VALUES (${id}, ${tenantId}, ${name}, ${text}, ${provider}, ${model || null}, NOW())
      RETURNING id, tenant_id, name, text, provider, model, created_at
    `;

    return NextResponse.json({ prompt: rows[0] });
  } catch (e: any) {
    console.error("/api/prompts POST error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Failed to create prompt" },
      { status: 500 }
    );
  }
}

/* ==================================================
 * DELETE /api/prompts?id=xxx - Delete prompt by ID
 * ================================================== */
export async function DELETE(req: NextRequest) {
  try {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const sql = getSql();
    await sql`
      DELETE FROM prompts
      WHERE id = ${id} AND tenant_id = ${tenantId}
    `;

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("/api/prompts DELETE error:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Failed to delete prompt" },
      { status: 500 }
    );
  }
}
