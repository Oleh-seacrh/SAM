import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

export const runtime = "nodejs";

type AIModelSettings = {
  provider: "openai" | "anthropic" | "gemini";
  defaultModel: string;
};

const DEFAULT_SETTINGS: AIModelSettings = {
  provider: "openai",
  defaultModel: "",
};

// GET /api/settings/ai-model - Load AI model settings
export async function GET(req: NextRequest) {
  try {
    const tenantId = getTenantIdFromSession();
    const sql = getSql();

    const rows = await sql/*sql*/`
      SELECT settings
      FROM tenant_settings
      WHERE tenant_id = ${tenantId}
      LIMIT 1;
    `;

    const stored = rows[0]?.settings;
    const aiModel = stored?.aiModel || {};
    
    const settings: AIModelSettings = {
      provider: aiModel.provider || DEFAULT_SETTINGS.provider,
      defaultModel: aiModel.defaultModel || DEFAULT_SETTINGS.defaultModel,
    };

    return NextResponse.json({ settings });
  } catch (e: any) {
    console.error("GET /api/settings/ai-model error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings/ai-model - Save AI model settings
export async function PUT(req: NextRequest) {
  try {
    const tenantId = getTenantIdFromSession();
    const body: AIModelSettings = await req.json();

    // Validate
    if (!["openai", "anthropic", "gemini"].includes(body.provider)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    const sql = getSql();

    // Load current settings
    const rows = await sql/*sql*/`
      SELECT settings
      FROM tenant_settings
      WHERE tenant_id = ${tenantId}
      LIMIT 1;
    `;

    const current = rows[0]?.settings || {};
    const updated = {
      ...current,
      aiModel: {
        provider: body.provider,
        defaultModel: (body.defaultModel || "").trim(),
      },
    };

    // Upsert
    await sql/*sql*/`
      INSERT INTO tenant_settings (tenant_id, settings, updated_at)
      VALUES (${tenantId}, ${JSON.stringify(updated)}, NOW())
      ON CONFLICT (tenant_id)
      DO UPDATE SET
        settings = ${JSON.stringify(updated)},
        updated_at = NOW();
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/settings/ai-model error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to save settings" },
      { status: 500 }
    );
  }
}
