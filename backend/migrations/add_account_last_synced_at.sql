-- Incremental sync watermark per Gmail account
ALTER TABLE gmail_accounts
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
