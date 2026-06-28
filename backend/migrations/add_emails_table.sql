-- Run on existing Neon DB if emails table does not exist yet.

CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    gmail_uid VARCHAR(50) NOT NULL,
    subject VARCHAR(1000) NOT NULL DEFAULT '',
    from_address VARCHAR(500) NOT NULL DEFAULT '',
    date_header VARCHAR(255) NOT NULL DEFAULT '',
    received_at TIMESTAMP,
    body TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    body_preview VARCHAR(500) NOT NULL DEFAULT '',
    synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, gmail_uid)
);

CREATE INDEX IF NOT EXISTS idx_emails_account_received
    ON emails (account_id, received_at DESC NULLS LAST);
