import { Menu, MessageCircle, RefreshCw } from "lucide-react";

export default function DashboardHeader({
  selectedAccount,
  emailsSyncing,
  stats,
  onOpenSidebar,
  onOpenCategories,
  onOpenChat,
  onSync,
}) {
  return (
    <header className="bg-card border-b border-border px-4 md:px-5 py-3 shrink-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="md:hidden p-2 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink truncate leading-tight">
              {selectedAccount
                ? selectedAccount.display_name || selectedAccount.email_address
                : "Select an account"}
            </h2>
            {selectedAccount && (
              <p className="text-[11px] text-muted font-mono truncate mt-0.5">
                {selectedAccount.email_address}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedAccount && (
            <button
              type="button"
              onClick={onOpenChat}
              className="btn-secondary hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Ask AI
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCategories}
            className="btn-secondary hidden sm:inline-flex text-xs px-3 py-1.5"
          >
            Categories
          </button>
          {selectedAccount && (
            <button
              type="button"
              onClick={onSync}
              disabled={emailsSyncing}
              className="btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              {emailsSyncing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {emailsSyncing ? "Syncing..." : "Sync"}
            </button>
          )}
        </div>
      </div>

      {selectedAccount && stats && (
        <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
          <span className="px-2 py-1 rounded-full bg-surface border border-border text-ink">
            Total <strong className="font-semibold">{stats.total}</strong>
          </span>
          <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-100 text-amber-800">
            Need reply <strong className="font-semibold">{stats.unreplied}</strong>
          </span>
          <span className="px-2 py-1 rounded-full bg-sky-50 border border-sky-100 text-sky-800">
            Replied <strong className="font-semibold">{stats.replied}</strong>
          </span>
          <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-800">
            Done <strong className="font-semibold">{stats.done}</strong>
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-2.5 sm:hidden">
        {selectedAccount && (
          <button
            type="button"
            onClick={onOpenChat}
            className="btn-secondary flex-1 text-xs py-1.5 inline-flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Ask AI
          </button>
        )}
        <button
          type="button"
          onClick={onOpenCategories}
          className="btn-secondary flex-1 text-xs py-1.5"
        >
          Categories
        </button>
      </div>
    </header>
  );
}
