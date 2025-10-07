-- Migration: Create prompts table
-- Run this in Neon Console SQL Editor

CREATE TABLE IF NOT EXISTS prompts (
  id VARCHAR(200) PRIMARY KEY,
  tenant_id VARCHAR(200) NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster tenant lookups
CREATE INDEX IF NOT EXISTS idx_prompts_tenant ON prompts(tenant_id);

-- Add comment
COMMENT ON TABLE prompts IS 'Saved LLM prompts for analysis';
