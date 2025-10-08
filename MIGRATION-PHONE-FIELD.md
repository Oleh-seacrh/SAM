# Migration: Add Phone Field to Organizations

## Problem
The `phone` column doesn't exist in the `organizations` table, causing errors when creating new leads with only phone/email.

## Solution
Add `phone`, `general_email`, `contact_email`, and `contact_person` columns to the `organizations` table.

## Run Migration

### Option 1: Using psql (Recommended)

```bash
psql 'postgresql://neondb_owner:npg_duS2og0ksaVm@ep-wandering-cake-adves3lm-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' -f migration-add-phone-to-organizations.sql
```

### Option 2: Using Neon Console

1. Open [Neon Console](https://console.neon.tech/)
2. Select your project
3. Go to SQL Editor
4. Copy and paste the contents of `migration-add-phone-to-organizations.sql`
5. Click "Run"

### Option 3: Using Node.js Script

Create a file `run-migration.mjs`:

```javascript
import postgres from '@neondatabase/serverless';

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  try {
    // Add phone column
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'phone'
          ) THEN
              ALTER TABLE organizations ADD COLUMN phone TEXT;
          END IF;
      END $$;
    `;

    // Add general_email column
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'general_email'
          ) THEN
              ALTER TABLE organizations ADD COLUMN general_email TEXT;
          END IF;
      END $$;
    `;

    // Add contact_email column
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'contact_email'
          ) THEN
              ALTER TABLE organizations ADD COLUMN contact_email TEXT;
          END IF;
      END $$;
    `;

    // Add contact_person column
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'contact_person'
          ) THEN
              ALTER TABLE organizations ADD COLUMN contact_person TEXT;
          END IF;
      END $$;
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_general_email ON organizations(general_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_phone ON organizations(phone)`;

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

migrate();
```

Then run:
```bash
node run-migration.mjs
```

## Changes Made

### 1. Database Schema
- ✅ Added `phone` column (TEXT, nullable)
- ✅ Added `general_email` column (TEXT, nullable)
- ✅ Added `contact_email` column (TEXT, nullable)
- ✅ Added `contact_person` column (TEXT, nullable)
- ✅ Created indexes for faster lookups

### 2. API Validation (`app/api/orgs/route.ts`)
- ✅ Removed strict requirement for `name`
- ✅ Now requires **at least one** of: name, domain, email, or phone
- ✅ All fields are now truly optional

### 3. Validation Logic
```typescript
// Before: name was required (auto-generated from domain/email)
// After: flexible validation
if (!name && !domain && !general_email && !contact_email && !phone) {
  return 400 "At least one field is required"
}
```

## Test Cases

### ✅ Valid: Only Email
```json
{
  "emails": ["info@acme.com"],
  "org_type": "prospect"
}
```

### ✅ Valid: Only Phone
```json
{
  "phone": "+380501234567",
  "org_type": "prospect"
}
```

### ✅ Valid: Only Domain
```json
{
  "domain": "acme.com",
  "org_type": "prospect"
}
```

### ✅ Valid: Only Name
```json
{
  "name": "John Doe",
  "org_type": "prospect"
}
```

### ❌ Invalid: Nothing
```json
{
  "org_type": "prospect"
}
```
→ Error: "At least one field is required"

## Verify Migration

After running the migration, verify in SQL Editor:

```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN ('phone', 'general_email', 'contact_email', 'contact_person');

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'organizations'
  AND indexname LIKE 'idx_organizations_%';
```

Expected output:
```
column_name     | data_type | is_nullable
----------------|-----------|------------
phone           | text      | YES
general_email   | text      | YES
contact_email   | text      | YES
contact_person  | text      | YES
```

## Rollback (if needed)

```sql
-- Remove columns
ALTER TABLE organizations DROP COLUMN IF EXISTS phone;
ALTER TABLE organizations DROP COLUMN IF EXISTS general_email;
ALTER TABLE organizations DROP COLUMN IF EXISTS contact_email;
ALTER TABLE organizations DROP COLUMN IF EXISTS contact_person;

-- Remove indexes
DROP INDEX IF EXISTS idx_organizations_general_email;
DROP INDEX IF EXISTS idx_organizations_contact_email;
DROP INDEX IF EXISTS idx_organizations_phone;
```

