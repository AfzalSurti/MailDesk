-- P1: Exact AI answer cache (per-account only — never shared across users)
CREATE TABLE IF NOT EXISTS chat_answer_cache (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
    question_hash VARCHAR(64) NOT NULL,
    question_norm TEXT NOT NULL,
    inbox_fingerprint VARCHAR(64) NOT NULL,
    answer TEXT NOT NULL,
    model VARCHAR(255),
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_hit_at TIMESTAMP
);

-- Same question + same inbox state + same account → one cached answer
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_cache_lookup
    ON chat_answer_cache (account_id, question_hash, inbox_fingerprint);

CREATE INDEX IF NOT EXISTS idx_chat_cache_user_account
    ON chat_answer_cache (user_id, account_id);
