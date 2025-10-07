-- Option 1: Drop and recreate (WARNING: deletes all existing prompts!)
DROP TABLE IF EXISTS prompts;

CREATE TABLE prompts (
  id VARCHAR(200) PRIMARY KEY,
  tenant_id VARCHAR(200) NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Option 2: Add missing column to existing table (safer, keeps data)
-- ALTER TABLE prompts ADD COLUMN tenant_id VARCHAR(200);
-- UPDATE prompts SET tenant_id = 'default' WHERE tenant_id IS NULL;
-- ALTER TABLE prompts ALTER COLUMN tenant_id SET NOT NULL;

