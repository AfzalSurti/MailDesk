-- Seed default categories if none exist yet
INSERT INTO categories (name, priority, description, keywords)
SELECT * FROM (VALUES
    (
        'Job Opportunities',
        'high'::priority_enum,
        'Job alerts, internships, career tips, recruitment and hiring emails',
        ARRAY['job', 'career', 'intern', 'hiring', 'vacancy', 'resume', 'recruiter', 'interview']::TEXT[]
    ),
    (
        'Finance & Billing',
        'high'::priority_enum,
        'Invoices, payments, receipts, billing statements and financial notices',
        ARRAY['invoice', 'payment', 'billing', 'receipt', 'due', 'subscription', 'charge']::TEXT[]
    ),
    (
        'Marketing & Newsletters',
        'low'::priority_enum,
        'Promotional offers, newsletters, ads and marketing campaigns',
        ARRAY['newsletter', 'promotion', 'offer', 'sale', 'discount', 'unsubscribe', 'marketing']::TEXT[]
    ),
    (
        'General Updates',
        'medium'::priority_enum,
        'General notifications, account updates and informational emails',
        ARRAY['update', 'notification', 'reminder', 'confirm', 'welcome', 'info']::TEXT[]
    )
) AS seed(name, priority, description, keywords)
WHERE NOT EXISTS (SELECT 1 FROM categories LIMIT 1);
