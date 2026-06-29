ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;

UPDATE users SET name = 'Admin' WHERE name = '' AND email = 'admin@company.com';
