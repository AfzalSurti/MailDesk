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

-- Insert default admin user (change password after first login)
-- Password: admin123
INSERT INTO users (email, hashed_password)
VALUES (
    'admin@company.com',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'
);