export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

// Type definition for AI Model settings
export type AIModelSettings = {
  provider: "openai" | "anthropic" | "gemini";
  defaultModel: string;
  temperature: number; // 0-1
  top_p: number; // 0-1
  seed?: number; // optional integer
};

// Default settings
const DEFAULT_AI_MODEL_SETTINGS: AIModelSettings = {
  provider: "openai",
  defaultModel: "gpt-4o-mini",
  temperature: 0.1,
  top_p: 1.0,
};

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  try {
    const rows = await sql/*sql*/`
      select ai_model_config
      from tenant_settings
      where tenant_id = ${tenantId}
      limit 1
    `;
    const cfg = rows[0]?.ai_model_config ?? DEFAULT_AI_MODEL_SETTINGS;
    return NextResponse.json(cfg);
  } catch (e: any) {
    console.error("GET /api/settings/ai-model error:", e);
    return NextResponse.json(DEFAULT_AI_MODEL_SETTINGS);
  }
}

export async function PUT(req: Request) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
  }

  let body: Partial<AIModelSettings> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate and normalize
  const provider = ["openai", "anthropic", "gemini"].includes(body.provider as any)
    ? body.provider
    : "openai";
  const defaultModel = body.defaultModel?.trim() || DEFAULT_AI_MODEL_SETTINGS.defaultModel;
  const temperature = typeof body.temperature === "number" 
    ? Math.max(0, Math.min(1, body.temperature)) 
    : DEFAULT_AI_MODEL_SETTINGS.temperature;
  const top_p = typeof body.top_p === "number"
    ? Math.max(0, Math.min(1, body.top_p))
    : DEFAULT_AI_MODEL_SETTINGS.top_p;
  const seed = body.seed !== undefined && body.seed !== null && typeof body.seed === "number"
    ? Math.floor(body.seed)
    : undefined;

  const cfg: AIModelSettings = {
    provider: provider as any,
    defaultModel,
    temperature,
    top_p,
    ...(seed !== undefined ? { seed } : {}),
  };

  try {
    await sql/*sql*/`
      insert into tenant_settings (tenant_id, ai_model_config)
      values (${tenantId}, ${cfg}::jsonb)
      on conflict (tenant_id) do update
        set ai_model_config = excluded.ai_model_config,
            updated_at = now()
    `;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/settings/ai-model error:", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

// POST as synonym to PUT
export async function POST(req: Request) {
  return PUT(req);
}
