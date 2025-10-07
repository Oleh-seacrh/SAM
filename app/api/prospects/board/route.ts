// app/api/prospects/board/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { getSql } from "@/lib/db";
import { getTenantIdFromSession } from "@/lib/auth";

export async function GET() {
  const sql = getSql();
  const tenantId = await getTenantIdFromSession();

  console.log("[GET /api/prospects/board] tenantId:", tenantId);

  if (!tenantId) {
    return Response.json({ error: "No tenant" }, { status: 401 });
  }

  try {
    // 1) Get or create prospect board for this tenant
    let boards = await sql`
      SELECT id, name
      FROM prospect_boards
      WHERE tenant_id = ${tenantId}
      ORDER BY id ASC
      LIMIT 1;
    `;
    
    console.log("[GET /api/prospects/board] Found boards:", boards.length);

    if (!boards.length) {
      console.log("[GET /api/prospects/board] Creating new board for tenant:", tenantId);
      const created = await sql`
        INSERT INTO prospect_boards(tenant_id, name)
        VALUES (${tenantId}, 'Prospects')
        RETURNING id, name;
      `;
      const boardId = created[0].id;
      console.log("[GET /api/prospects/board] Created board:", boardId);

      // Create default columns for prospect workflow
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
      console.log("[GET /api/prospects/board] Created 7 columns");

      boards = created;
    }

    const boardId = boards[0].id;
    console.log("[GET /api/prospects/board] Using boardId:", boardId);

    // 2) Get columns
    const columns = await sql`
      SELECT
        id,
        key,
        title,
        wip_limit AS "wipLimit",
        position
      FROM prospect_columns
      WHERE board_id = ${boardId}
      ORDER BY position;
    `;
    
    console.log("[GET /api/prospects/board] Found columns:", columns.length);

    // 3) Get tasks with ISO date formatting
    const tasks = await sql`
      SELECT
        id,
        tenant_id AS "tenantId",
        board_id  AS "boardId",
        column_id AS "columnId",
        domain,
        homepage,
        company_name AS "companyName",
        title,
        description,
        snippet,
        score_label AS "scoreLabel",
        score_confidence AS "scoreConfidence",
        score_reason AS "scoreReason",
        company_type AS "companyType",
        country_iso2 AS "countryIso2",
        country_name AS "countryName",
        country_confidence AS "countryConfidence",
        emails,
        phones,
        brands,
        pages_analyzed AS "pagesAnalyzed",
        
        CASE WHEN deep_analyzed_at IS NULL THEN NULL
             ELSE to_char(deep_analyzed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "deepAnalyzedAt",
        
        priority,
        status,
        owner,
        assignees,
        tags,
        progress,
        position,
        archived,
        
        CASE WHEN start_at IS NULL THEN NULL
             ELSE to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "startAt",
        
        CASE WHEN due_at IS NULL THEN NULL
             ELSE to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "dueAt",
        
        CASE WHEN contacted_at IS NULL THEN NULL
             ELSE to_char(contacted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "contactedAt",
        
        CASE WHEN replied_at IS NULL THEN NULL
             ELSE to_char(replied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "repliedAt",
        
        CASE WHEN won_at IS NULL THEN NULL
             ELSE to_char(won_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "wonAt",
        
        CASE WHEN lost_at IS NULL THEN NULL
             ELSE to_char(lost_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "lostAt",
        
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM prospect_tasks
      WHERE board_id = ${boardId}
        AND tenant_id = ${tenantId}
        AND archived = false
      ORDER BY position, created_at;
    `;
    
    console.log("[GET /api/prospects/board] Found tasks:", tasks.length);
    console.log("[GET /api/prospects/board] Returning board:", { 
      id: boardId, 
      name: boards[0].name, 
      columnsCount: columns.length, 
      tasksCount: tasks.length 
    });

    return Response.json({
      board: { id: boardId, name: boards[0].name, columns, tasks },
    });
  } catch (e: any) {
    console.error("GET /api/prospects/board failed:", e);
    console.error("Stack:", e?.stack);
    return Response.json(
      { error: e?.detail || e?.message || String(e) },
      { status: 500 }
    );
  }
}

