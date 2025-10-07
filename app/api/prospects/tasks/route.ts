// app/api/prospects/tasks/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSql, toPgTextArray } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

/* -------------------- POST: Create prospect task from search result -------------------- */
export async function POST(req: NextRequest) {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      domain,
      homepage,
      companyName,
      title,
      description,
      snippet,
      scoreLabel,
      scoreConfidence,
      scoreReason,
      companyType,
      countryIso2,
      countryName,
      countryConfidence,
      emails = [],
      phones = [],
      brands = [],
      pagesAnalyzed = 0,
      deepAnalyzedAt,
      priority = "Normal",
      columnKey = "to_contact",
      tags = [],
      owner,
      dueAt,
    } = body;

    if (!domain || !title) {
      return NextResponse.json(
        { error: "domain and title are required" },
        { status: 400 }
      );
    }

    // Get or create board
    let boards = await sql`
      SELECT id FROM prospect_boards WHERE tenant_id = ${tenantId} LIMIT 1;
    `;

    let boardId: number;
    if (!boards.length) {
      const created = await sql`
        INSERT INTO prospect_boards(tenant_id, name)
        VALUES (${tenantId}, 'Prospects')
        RETURNING id;
      `;
      boardId = created[0].id;

      // Create default columns
      await sql`
        INSERT INTO prospect_columns (board_id, key, title, position) VALUES
        (${boardId}, 'to_contact',    'To Contact',    1),
        (${boardId}, 'contacted',     'Contacted',     2),
        (${boardId}, 'send_offer',    'Send Offer',    3),
        (${boardId}, 'waiting_reply', 'Waiting Reply', 4),
        (${boardId}, 'negotiating',   'Negotiating',   5),
        (${boardId}, 'won',           'Won',           6),
        (${boardId}, 'lost',          'Lost',          7);
      `;
    } else {
      boardId = boards[0].id;
    }

    // Find column by key
    const columns = await sql`
      SELECT id FROM prospect_columns
      WHERE board_id = ${boardId} AND key = ${columnKey}
      LIMIT 1;
    `;

    if (!columns.length) {
      return NextResponse.json({ error: "Column not found" }, { status: 400 });
    }

    const columnId = columns[0].id;

    // Check if prospect already exists for this domain (prevent duplicates)
    const existing = await sql`
      SELECT id FROM prospect_tasks
      WHERE tenant_id = ${tenantId} AND domain = ${domain} AND archived = false
      LIMIT 1;
    `;

    if (existing.length) {
      return NextResponse.json(
        { error: "Prospect already exists for this domain", taskId: existing[0].id },
        { status: 409 }
      );
    }

    // Create prospect task
    const tasks = await sql`
      INSERT INTO prospect_tasks (
        tenant_id,
        board_id,
        column_id,
        domain,
        homepage,
        company_name,
        title,
        description,
        snippet,
        score_label,
        score_confidence,
        score_reason,
        company_type,
        country_iso2,
        country_name,
        country_confidence,
        emails,
        phones,
        brands,
        pages_analyzed,
        deep_analyzed_at,
        priority,
        status,
        tags,
        owner,
        due_at
      )
      VALUES (
        ${tenantId},
        ${boardId},
        ${columnId},
        ${domain},
        ${homepage || null},
        ${companyName || null},
        ${title},
        ${description || null},
        ${snippet || null},
        ${scoreLabel || null},
        ${scoreConfidence || null},
        ${scoreReason || null},
        ${companyType || null},
        ${countryIso2 || null},
        ${countryName || null},
        ${countryConfidence || null},
        ${toPgTextArray(emails)}::text[],
        ${toPgTextArray(phones)}::text[],
        ${toPgTextArray(brands)}::text[],
        ${pagesAnalyzed || 0},
        ${deepAnalyzedAt || null},
        ${priority},
        'new',
        ${toPgTextArray(tags)}::text[],
        ${owner || null},
        ${dueAt || null}
      )
      RETURNING *;
    `;

    return NextResponse.json({ ok: true, task: tasks[0] }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/prospects/tasks failed:", e);
    return NextResponse.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

