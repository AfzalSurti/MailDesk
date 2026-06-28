import { Menu, RefreshCw } from "lucide-react";

export default function DashboardHeader({
  selectedAccount,
  emailCount,
  emailsLoading,
  onOpenSidebar,
  onOpenCategories,
  onSync,
}) {
  return (
    <header className="bg-card border-b border-border px-4 md:px-6 py-4 shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="md:hidden p-2 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink truncate">
              {selectedAccount
                ? selectedAccount.display_name || selectedAccount.email_address
                : "Select an account"}
            </h2>
            {selectedAccount && (
              <p className="text-xs text-muted font-mono mt-0.5 truncate">
                {selectedAccount.email_address}
              </p>
            )}
            {selectedAccount && emailCount > 0 && (
              <p className="text-xs text-muted mt-1">
                {emailCount} email{emailCount !== 1 ? "s" : ""} saved
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCategories}
            className="btn-secondary hidden sm:inline-flex"
          >
            Categories
          </button>
          {selectedAccount && (
            <button
              type="button"
              onClick={onSync}
              disabled={emailsLoading}
              className="btn-primary inline-flex items-center gap-2"
            >
              {emailsLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {emailsLoading ? "Syncing..." : "Sync"}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3 sm:hidden">
        <button type="button" onClick={onOpenCategories} className="btn-secondary flex-1">
          Categories
        </button>
      </div>
    </header>
  );
}
