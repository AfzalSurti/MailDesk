import { Link, Navigate } from "react-router-dom";
import { Inbox, Sparkles, Shield, ArrowRight } from "lucide-react";
import useStore from "../store/useStore";

export default function LandingPage() {
  const token = useStore((s) => s.token);
  if (token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-surface">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-ink">MailDesk</span>
        </div>
        <Link
          to="/login"
          className="px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
        >
          Sign In
        </Link>
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
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
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
        <p className="text-sm text-muted">MailDesk — Internal company email tool</p>
      </footer>
    </div>
  );
}
