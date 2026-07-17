-- P5: Semantic cache vectors + AI usage / rate-limit logs
ALTER TABLE chat_answer_cache
    ADD COLUMN IF NOT EXISTS question_embedding vector(1536);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id UUID PRIMARY KEY,
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
