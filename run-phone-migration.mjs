// run-phone-migration.mjs
import postgres from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  console.log('🚀 Starting migration...\n');

  try {
    // Make name column nullable
    console.log('📝 Making name column nullable...');
    await sql`ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL`;
    console.log('   ✓ name is now nullable\n');

    // Add phone column
    console.log('📝 Adding phone column...');
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'phone'
          ) THEN
              ALTER TABLE organizations ADD COLUMN phone TEXT;
              RAISE NOTICE 'Column phone added';
          ELSE
              RAISE NOTICE 'Column phone already exists';
          END IF;
      END $$;
    `;

    // Add general_email column
    console.log('📝 Adding general_email column...');
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'general_email'
          ) THEN
              ALTER TABLE organizations ADD COLUMN general_email TEXT;
              RAISE NOTICE 'Column general_email added';
          ELSE
              RAISE NOTICE 'Column general_email already exists';
          END IF;
      END $$;
    `;

    // Add contact_email column
    console.log('📝 Adding contact_email column...');
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'contact_email'
          ) THEN
              ALTER TABLE organizations ADD COLUMN contact_email TEXT;
              RAISE NOTICE 'Column contact_email added';
          ELSE
              RAISE NOTICE 'Column contact_email already exists';
          END IF;
      END $$;
    `;

    // Add contact_person column
    console.log('📝 Adding contact_person column...');
    await sql`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'organizations' 
              AND column_name = 'contact_person'
          ) THEN
              ALTER TABLE organizations ADD COLUMN contact_person TEXT;
              RAISE NOTICE 'Column contact_person added';
          ELSE
              RAISE NOTICE 'Column contact_person already exists';
          END IF;
      END $$;
    `;

    // Create indexes
    console.log('📝 Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_general_email ON organizations(general_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_organizations_phone ON organizations(phone)`;

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verifying columns...');

    // Verify
    const result = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'organizations'
        AND column_name IN ('phone', 'general_email', 'contact_email', 'contact_person')
      ORDER BY column_name;
    `;

    console.table(result);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();

