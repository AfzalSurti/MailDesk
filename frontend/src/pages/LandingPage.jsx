import { Link } from "react-router-dom";
import { Inbox, Sparkles, Shield, ArrowRight, LayoutDashboard } from "lucide-react";
import useStore from "../store/useStore";

export default function LandingPage() {
  const token = useStore((s) => s.token);
  const isLoggedIn = Boolean(token);

  return (
    <div className="min-h-screen bg-surface">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-ink">MailDesk</span>
        </div>

        {isLoggedIn ? (
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            Return to Dashboard
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/signup"
              className="px-5 py-2 text-sm font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Sign Up
            </Link>
            <Link
              to="/login"
              className="px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-accent uppercase tracking-wider mb-4">
            Company Email Management
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-ink leading-tight mb-6">
            Manage all your Gmail inboxes in one place
          </h1>
          <p className="text-lg text-muted mb-10 leading-relaxed">
            Connect multiple company Gmail accounts, sync emails instantly,
            and let AI categorize them by priority — all from a single dashboard.
          </p>

          {isLoggedIn ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Go to Dashboard
            </Link>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-6 py-3 border border-border text-ink hover:bg-card font-semibold rounded-lg transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-20">
          <div className="bg-card border border-border rounded-xl p-6">
            <Inbox className="w-8 h-8 text-accent mb-4" />
            <h3 className="font-semibold text-ink mb-2">Multi-Inbox Sync</h3>
            <p className="text-sm text-muted">
              Connect and manage multiple Gmail accounts from one workspace.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <Sparkles className="w-8 h-8 text-accent mb-4" />
            <h3 className="font-semibold text-ink mb-2">AI Categorization</h3>
            <p className="text-sm text-muted">
              Automatically sort emails into categories with smart priority tagging.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6">
            <Shield className="w-8 h-8 text-accent mb-4" />
            <h3 className="font-semibold text-ink mb-2">Secure Access</h3>
            <p className="text-sm text-muted">
              Encrypted credentials and JWT-protected API for your team.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 mt-12 border-t border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-muted space-y-1">
            <p>© 2026 Geo Designs &amp; Research Pvt. Ltd. All rights reserved.</p>
            <p className="text-xs">MailDesk — Internal company email tool</p>
          </div>
          <p className="text-sm text-muted sm:text-right">
            Made by{" "}
            <a
              href="https://www.linkedin.com/in/afzal-surti-9904b2287/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover font-medium transition-colors"
            >
              Afzal N. Surti
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
