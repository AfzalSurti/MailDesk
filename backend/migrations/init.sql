CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gmail_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_address VARCHAR(255) UNIQUE NOT NULL,
    app_password VARCHAR(500) NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TYPE priority_enum AS ENUM ('high', 'medium', 'low');

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    priority priority_enum NOT NULL DEFAULT 'low',
    description TEXT,
    keywords TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE emails (
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

CREATE INDEX idx_emails_account_received ON emails (account_id, received_at DESC NULLS LAST);

-- Insert default admin user (change password after first login)
-- Password: admin123
INSERT INTO users (email, hashed_password)
VALUES (
    'admin@company.com',
    '$2b$12$X8M6J1c7fxMcC3JJXvAJP.POuId25Tt9LY5BiwKtyoGDtq8Pmumpm'
);