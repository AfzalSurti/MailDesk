-- P3: Background job queue for sync / bulk categorize (Postgres-backed)
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY,
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
