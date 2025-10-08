-- migration-add-phone-to-organizations.sql
-- Додає колонку phone до таблиці organizations, якщо її ще немає

-- Перевіримо чи існує колонка
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

-- Також перевіримо інші колонки які можуть бути відсутні
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

-- Опціонально: створимо індекси для швидкого пошуку
CREATE INDEX IF NOT EXISTS idx_organizations_general_email ON organizations(general_email);
CREATE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email);
CREATE INDEX IF NOT EXISTS idx_organizations_phone ON organizations(phone);

