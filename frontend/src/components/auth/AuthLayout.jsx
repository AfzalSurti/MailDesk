export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
      <div className="bg-card rounded-2xl shadow-sm border border-border p-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
