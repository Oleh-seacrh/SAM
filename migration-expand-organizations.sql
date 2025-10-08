-- Migration: Expand organizations table with social platforms and multiple contacts
-- Date: 2025-01-08

-- Add new social platform columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS alibaba_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS made_in_china_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS indiamart_url TEXT;

-- Add multiple contacts support (we'll store as JSONB array)
-- Each contact: { name: string, email: string, phone: string, position?: string }
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb;

-- Migrate existing contact data to contacts array (if needed)
-- This creates first contact from existing fields
UPDATE organizations
SET contacts = jsonb_build_array(
  jsonb_build_object(
    'name', contact_name,
    'email', contact_email,
    'phone', contact_phone
  )
)
WHERE contact_name IS NOT NULL 
   OR contact_email IS NOT NULL 
   OR contact_phone IS NOT NULL;

-- Note: We keep old columns for backward compatibility
-- They can be removed later if needed:
-- ALTER TABLE organizations DROP COLUMN contact_name;
-- ALTER TABLE organizations DROP COLUMN contact_email;
-- ALTER TABLE organizations DROP COLUMN contact_phone;

-- Add indexes for new social URLs
CREATE INDEX IF NOT EXISTS idx_orgs_alibaba ON organizations(alibaba_url) WHERE alibaba_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_made_in_china ON organizations(made_in_china_url) WHERE made_in_china_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_indiamart ON organizations(indiamart_url) WHERE indiamart_url IS NOT NULL;

-- Add GIN index for contacts JSONB for faster searches
CREATE INDEX IF NOT EXISTS idx_orgs_contacts_gin ON organizations USING GIN (contacts);

