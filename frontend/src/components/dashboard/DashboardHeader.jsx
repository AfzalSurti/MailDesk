import { Menu, MessageCircle, RefreshCw } from "lucide-react";
import { formatSyncStatus } from "../../utils/syncStatus";

export default function DashboardHeader({
  selectedAccount,
  emailsSyncing,
  syncProgress,
  stats,
  onOpenSidebar,
  onOpenCategories,
  onOpenChat,
  onSyncAccount,
  onSyncAll,
  hasAccounts,
}) {
  const liveStatus = formatSyncStatus(syncProgress);
  const syncingOne =
    emailsSyncing && syncProgress && Number(syncProgress.total) <= 1;
  const syncingAll =
    emailsSyncing && syncProgress && Number(syncProgress.total) > 1;

  return (
    <header className="no-print bg-card border-b border-border px-4 md:px-5 py-3 shrink-0">
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
            {emailsSyncing && liveStatus && (
              <p className="text-[11px] text-accent truncate mt-0.5 tabular-nums">
                {liveStatus}
                {syncProgress?.email ? ` · ${syncProgress.email}` : ""}
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
              onClick={onSyncAccount}
              disabled={emailsSyncing}
              title="Sync this account only"
              className="btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              {(syncingOne || (emailsSyncing && !syncingAll)) && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              )}
              {syncingOne ? liveStatus || "Syncing…" : "Sync"}
            </button>
          )}
          {hasAccounts && (
            <button
              type="button"
              onClick={onSyncAll}
              disabled={emailsSyncing}
              title="Sync every Gmail account"
              className="btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              {syncingAll && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {syncingAll
                ? `Syncing ${syncProgress.current}/${syncProgress.total}…`
                : "Sync all"}
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
      {hasAccounts && (
        <div className="flex gap-2 mt-2 sm:hidden">
          {selectedAccount && (
            <button
              type="button"
              onClick={onSyncAccount}
              disabled={emailsSyncing}
              className="btn-secondary flex-1 text-xs py-1.5 inline-flex items-center justify-center gap-1.5"
            >
              {(syncingOne || (emailsSyncing && !syncingAll)) && (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              )}
              Sync
            </button>
          )}
          <button
            type="button"
            onClick={onSyncAll}
            disabled={emailsSyncing}
            className="btn-primary flex-1 text-xs py-1.5 inline-flex items-center justify-center gap-1.5"
          >
            {syncingAll && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Sync all
          </button>
        </div>
      )}
    </header>
  );
}
