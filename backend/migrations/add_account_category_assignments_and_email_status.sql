CREATE TABLE IF NOT EXISTS account_category_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_account_category_assignment UNIQUE (account_id, category_id)
);

INSERT INTO account_category_assignments (account_id, category_id)
SELECT a.id, c.id
FROM gmail_accounts a
JOIN categories c ON c.user_id = a.user_id
ON CONFLICT (account_id, category_id) DO NOTHING;

ALTER TABLE emails ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS done_at TIMESTAMP NULL;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP NULL;
