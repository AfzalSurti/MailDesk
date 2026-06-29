-- Per-user workspace isolation: gmail accounts and categories belong to a user.

ALTER TABLE gmail_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

UPDATE gmail_accounts
SET user_id = (SELECT id FROM users WHERE email = 'admin@company.com' LIMIT 1)
WHERE user_id IS NULL;

UPDATE categories
SET user_id = (SELECT id FROM users WHERE email = 'admin@company.com' LIMIT 1)
WHERE user_id IS NULL;

ALTER TABLE gmail_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE gmail_accounts DROP CONSTRAINT IF EXISTS gmail_accounts_email_address_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_accounts_user_email ON gmail_accounts (user_id, email_address);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_user_name ON categories (user_id, name);
