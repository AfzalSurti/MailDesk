-- P4: Neon pgvector email embeddings for RAG (scoped per user + account)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS email_embeddings (
    id UUID PRIMARY KEY,
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

-- HNSW works well for MailDesk-sized inboxes on Neon
CREATE INDEX IF NOT EXISTS idx_email_embeddings_hnsw
    ON email_embeddings
    USING hnsw (embedding vector_cosine_ops);
