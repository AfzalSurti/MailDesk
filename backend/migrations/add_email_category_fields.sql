-- Add AI category fields to emails (existing DBs)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS category_name VARCHAR(255);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS category_priority VARCHAR(20);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION;
