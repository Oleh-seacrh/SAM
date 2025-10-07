-- Test query to check prompts table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prompts'
ORDER BY ordinal_position;
