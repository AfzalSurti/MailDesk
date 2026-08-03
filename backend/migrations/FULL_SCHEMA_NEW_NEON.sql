-- =============================================================================
-- MailDesk — FULL SCHEMA for a NEW Neon database
-- Run this once in Neon SQL Editor (production branch).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Gmail accounts (multiple mail IDs per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gmail_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_address VARCHAR(255) NOT NULL,
    app_password VARCHAR(500) NOT NULL,
    display_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    inbox_digest TEXT,
    inbox_digest_updated_at TIMESTAMP,
    last_synced_at TIMESTAMP,
    UNIQUE (user_id, email_address)
);

-- ---------------------------------------------------------------------------
-- Categories + per-account assignment (filters)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priority_enum') THEN
        CREATE TYPE priority_enum AS ENUM ('high', 'medium', 'low');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority priority_enum NOT NULL DEFAULT 'low',
    description TEXT,
    keywords TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS account_category_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (account_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Emails (last ~3 days per account; cleaned on Sync)
-- ---------------------------------------------------------------------------
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
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255),
    category_priority VARCHAR(20),
    confidence_score DOUBLE PRECISION,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    done_at TIMESTAMP NULL,
    replied_at TIMESTAMP NULL,
    message_id VARCHAR(500),
    has_reply BOOLEAN NOT NULL DEFAULT FALSE,
    reply_subject VARCHAR(1000),
    reply_body TEXT,
    reply_body_html TEXT,
    reply_at TIMESTAMP NULL,
    UNIQUE (account_id, gmail_uid)
);

CREATE INDEX IF NOT EXISTS idx_emails_account_received
    ON emails (account_id, received_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_emails_account_message_id
    ON emails (account_id, message_id);

-- ---------------------------------------------------------------------------
-- Background jobs (sync / re-categorize queue)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    error TEXT,
    result_json TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_user_created
    ON background_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_background_jobs_account_status
    ON background_jobs (account_id, status);

-- ---------------------------------------------------------------------------
-- Chat answer cache (per user + account only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_answer_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    question_hash VARCHAR(64) NOT NULL,
    question_norm TEXT NOT NULL,
    inbox_fingerprint VARCHAR(64) NOT NULL,
    answer TEXT NOT NULL,
    model VARCHAR(255),
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_hit_at TIMESTAMP,
    question_embedding vector(1536)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_cache_lookup
    ON chat_answer_cache (account_id, question_hash, inbox_fingerprint);
CREATE INDEX IF NOT EXISTS idx_chat_cache_user_account
    ON chat_answer_cache (user_id, account_id);

-- ---------------------------------------------------------------------------
-- Email embeddings (RAG) — scoped per user + account
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    gmail_uid VARCHAR(50) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_email_embeddings_account_uid UNIQUE (account_id, gmail_uid)
);

CREATE INDEX IF NOT EXISTS idx_email_embeddings_user_account
    ON email_embeddings (user_id, account_id);

CREATE INDEX IF NOT EXISTS idx_email_embeddings_hnsw
    ON email_embeddings
    USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- AI usage / rate-limit logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES gmail_accounts(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    model VARCHAR(255),
    cached BOOLEAN NOT NULL DEFAULT FALSE,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    meta TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
    ON ai_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_action_created
    ON ai_usage_logs (user_id, action, created_at DESC);

-- Done. Create users via MailDesk Signup / Google login (no seed required).
