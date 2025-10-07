-- Migration: Prospect Tasks System
-- Creates tables for managing prospect outreach workflow

-- 1. Prospect Kanban Boards (per tenant)
CREATE TABLE IF NOT EXISTS prospect_boards (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(200) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT 'Prospects',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_boards_tenant ON prospect_boards(tenant_id);

-- 2. Prospect Kanban Columns
CREATE TABLE IF NOT EXISTS prospect_columns (
  id SERIAL PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES prospect_boards(id) ON DELETE CASCADE,
  key VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_columns_board ON prospect_columns(board_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_columns_board_key ON prospect_columns(board_id, key);

-- 3. Prospect Tasks (with rich company data)
CREATE TABLE IF NOT EXISTS prospect_tasks (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(200) NOT NULL,
  board_id INTEGER NOT NULL REFERENCES prospect_boards(id) ON DELETE CASCADE,
  column_id INTEGER NOT NULL REFERENCES prospect_columns(id) ON DELETE RESTRICT,
  
  -- Company identification
  domain VARCHAR(500) NOT NULL,
  homepage VARCHAR(1000),
  company_name VARCHAR(500),
  
  -- Task metadata
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  -- Company data (from search/analysis)
  snippet TEXT,
  score_label VARCHAR(20), -- 'good', 'maybe', 'bad'
  score_confidence NUMERIC(3,2),
  score_reason TEXT,
  company_type VARCHAR(50), -- 'manufacturer', 'distributor', 'dealer', 'other'
  
  -- Country detection
  country_iso2 VARCHAR(2),
  country_name VARCHAR(100),
  country_confidence VARCHAR(20), -- 'HIGH', 'WEAK'
  
  -- Contacts (from deep analysis)
  emails TEXT[], -- array of emails
  phones TEXT[], -- array of phones
  
  -- Brands matched
  brands TEXT[], -- array of brand names
  
  -- Deep analysis metadata
  pages_analyzed INTEGER DEFAULT 0,
  deep_analyzed_at TIMESTAMP WITH TIME ZONE,
  
  -- Task management
  priority VARCHAR(20) DEFAULT 'Normal', -- 'Low', 'Normal', 'High', 'Urgent'
  status VARCHAR(50) DEFAULT 'new', -- auto-computed from column
  owner VARCHAR(200),
  assignees TEXT[],
  tags TEXT[],
  
  -- Progress tracking
  progress INTEGER DEFAULT 0, -- 0-100
  position INTEGER DEFAULT 0,
  archived BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  start_at TIMESTAMP WITH TIME ZONE,
  due_at TIMESTAMP WITH TIME ZONE,
  contacted_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  won_at TIMESTAMP WITH TIME ZONE,
  lost_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_tasks_tenant ON prospect_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_board ON prospect_tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_column ON prospect_tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_domain ON prospect_tasks(domain);
CREATE INDEX IF NOT EXISTS idx_prospect_tasks_archived ON prospect_tasks(archived);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospect_tasks_tenant_domain ON prospect_tasks(tenant_id, domain) WHERE archived = FALSE;

-- 4. Prospect Task Comments
CREATE TABLE IF NOT EXISTS prospect_task_comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES prospect_tasks(id) ON DELETE CASCADE,
  author VARCHAR(200),
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_comments_task ON prospect_task_comments(task_id);

-- 5. Default prospect columns for each tenant
-- Note: Run this manually for each tenant or via API on first access
-- Example columns for prospect workflow:
-- INSERT INTO prospect_columns (board_id, key, title, position) VALUES
--   (board_id, 'to_contact', 'To Contact', 1),
--   (board_id, 'contacted', 'Contacted', 2),
--   (board_id, 'send_offer', 'Send Offer', 3),
--   (board_id, 'waiting_reply', 'Waiting Reply', 4),
--   (board_id, 'negotiating', 'Negotiating', 5),
--   (board_id, 'won', 'Won', 6),
--   (board_id, 'lost', 'Lost', 7);

