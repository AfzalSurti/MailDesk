CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
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
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    category_name VARCHAR(255),
    category_priority VARCHAR(20),
    confidence_score DOUBLE PRECISION,
    UNIQUE (account_id, gmail_uid)
);

CREATE INDEX idx_emails_account_received ON emails (account_id, received_at DESC NULLS LAST);

-- Default categories for AI classification
INSERT INTO categories (name, priority, description, keywords) VALUES
(
    'Job Opportunities',
    'high',
    'Job alerts, internships, career tips, recruitment and hiring emails. NOT security codes or 2FA emails.',
    ARRAY['job alert', 'career', 'intern', 'hiring', 'vacancy', 'resume', 'recruiter', 'interview', 'apply now']
),
(
    'Finance & Billing',
    'high',
    'Invoices, payments, receipts, billing statements and financial notices',
    ARRAY['invoice', 'payment', 'billing', 'receipt', 'due', 'subscription', 'charge']
),
(
    'Security & Authentication',
    'high',
    'Verification codes, 2-step/2FA, login alerts, password resets, account security from Google, Microsoft, etc.',
    ARRAY['verification', '2-step', 'two-step', '2fa', 'security alert', 'sign-in', 'login', 'authentication', 'verify']
),
(
    'Marketing & Newsletters',
    'low',
    'Promotional offers, newsletters, ads and marketing campaigns',
    ARRAY['newsletter', 'promotion', 'offer', 'sale', 'discount', 'unsubscribe', 'marketing']
),
(
    'General Updates',
    'medium',
    'General notifications, account updates and informational emails that do not fit other categories',
    ARRAY['update', 'notification', 'reminder', 'confirm', 'welcome', 'info']
);

-- Insert default admin user (change password after first login)
-- Password: admin123
INSERT INTO users (name, email, hashed_password)
VALUES (
    'Admin',
    'admin@company.com',
    '$2b$12$X8M6J1c7fxMcC3JJXvAJP.POuId25Tt9LY5BiwKtyoGDtq8Pmumpm'
);