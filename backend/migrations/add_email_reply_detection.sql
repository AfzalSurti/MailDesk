-- Reply detection fields + stats support (synced emails only)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS message_id VARCHAR(500);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS has_reply BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_subject VARCHAR(1000);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_body TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_body_html TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS reply_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_emails_account_message_id ON emails (account_id, message_id);
