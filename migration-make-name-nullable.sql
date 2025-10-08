-- migration-make-name-nullable.sql
-- Робить колонку "name" nullable в таблиці organizations
-- Щоб можна було створювати організації тільки з email/phone/domain

-- Зняти NOT NULL constraint з колонки name
ALTER TABLE organizations ALTER COLUMN name DROP NOT NULL;

-- Перевіримо результат
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name = 'name';

