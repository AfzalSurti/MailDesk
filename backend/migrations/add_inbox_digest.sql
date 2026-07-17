-- P2: Store compact inbox digest per Gmail account (for cheaper AI chat prompts)
ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS inbox_digest TEXT,
    ADD COLUMN IF NOT EXISTS inbox_digest_updated_at TIMESTAMP;
