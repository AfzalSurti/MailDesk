import { useMemo, useState } from "react";
import { Inbox, Mail, RefreshCw, Search, X } from "lucide-react";
import useStore, {
  isAccountRecategorizing,
  isAccountSyncing,
} from "../store/useStore";
import { stripHtml } from "../utils/stripHtml";
import { formatEmailDate, formatSender } from "../utils/format";
import { formatSyncStatus } from "../utils/syncStatus";
import { useResizableWidth } from "../hooks/useResizableWidth";
import EmptyState from "./ui/EmptyState";
import CategoryBadge from "./ui/CategoryBadge";

const PRIORITY_FILTERS = ["all", "high", "medium", "low"];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIORITY_CHIP = {
  all: "bg-ink/10 text-ink border-ink/20",
  high: "bg-red-100 text-red-700 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

function ListShell({
  children,
  className = "",
  shellRef,
  width,
  isDesktop,
  resizing,
  onResizeStart,
}) {
  return (
    <div
      ref={shellRef}
      style={isDesktop ? { width, flex: "0 0 auto" } : undefined}
      className={`no-print relative w-full border-r border-border bg-surface flex flex-col min-h-0 ${className}`}
    >
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inbox panel"
        onMouseDown={onResizeStart}
        className={`hidden md:block absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-20 transition-colors ${
          resizing ? "bg-accent" : "hover:bg-accent/40"
        }`}
      />
    </div>
  );
}

export default function EmailList({ onRefresh }) {
  const emails = useStore((s) => s.emails);
  const categories = useStore((s) => s.categories);
  const emailsLoading = useStore((s) => s.emailsLoading);
  const selectedAccount = useStore((s) => s.selectedAccount);
  const selectedEmailId = useStore((s) => s.selectedEmailId);
  const setSelectedEmailId = useStore((s) => s.setSelectedEmailId);
  const emailsSyncing = useStore((s) =>
    isAccountSyncing(s, selectedAccount?.id)
  );
  const emailsRecategorizing = useStore((s) =>
    isAccountRecategorizing(s, selectedAccount?.id)
  );
  const anySyncing = useStore((s) =>
    Object.values(s.syncingAccountIds || {}).some(Boolean)
  );
  const syncProgress = useStore((s) => s.syncProgress);
  const statusLabel = formatSyncStatus(syncProgress, {
    recategorizing: emailsRecategorizing,
  });

  const resize = useResizableWidth();
  const shellProps = {
    shellRef: resize.panelRef,
    width: resize.width,
    isDesktop: resize.isDesktop,
    resizing: resize.resizing,
    onResizeStart: resize.onResizeStart,
  };

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortByPriority, setSortByPriority] = useState(false);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    (categories || []).forEach((c) => c?.name && set.add(c.name));
    (emails || []).forEach((e) => e.category_name && set.add(e.category_name));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categories, emails]);

  const visibleEmails = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (emails || []).filter((e) => {
      if (categoryFilter !== "all" && (e.category_name || "") !== categoryFilter) {
        return false;
      }
      if (
        priorityFilter !== "all" &&
        (e.category_priority || "").toLowerCase() !== priorityFilter
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        e.subject || "",
        e.from_address || "",
        formatSender(e.from_address),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    if (sortByPriority) {
      list = [...list].sort((a, b) => {
        const ra = PRIORITY_RANK[(a.category_priority || "").toLowerCase()] ?? 3;
        const rb = PRIORITY_RANK[(b.category_priority || "").toLowerCase()] ?? 3;
        return ra - rb; // stable: keeps newest-first order within a priority
      });
    }
    return list;
  }, [emails, query, categoryFilter, priorityFilter, sortByPriority]);

  const filtersActive =
    query.trim() !== "" ||
    categoryFilter !== "all" ||
    priorityFilter !== "all";

  const hiddenOnMobile = selectedEmailId ? "hidden md:flex" : "flex";
  const showInitialLoader = emailsLoading && emails.length === 0 && !emailsSyncing;

  if (!selectedAccount) {
    return (
      <ListShell {...shellProps} className="items-center justify-center">
        <EmptyState
          icon={Inbox}
          title="No account selected"
          description="Pick a Gmail account from the sidebar to view its inbox."
        />
      </ListShell>
    );
  }

  if (showInitialLoader) {
    return (
      <ListShell
        {...shellProps}
        className={`${hiddenOnMobile} items-center justify-center`}
      >
        <div className="flex items-center gap-2 text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading inbox...
        </div>
      </ListShell>
    );
  }

  if (emails.length === 0 && !emailsSyncing && !anySyncing) {
    return (
      <ListShell
        {...shellProps}
        className={`${hiddenOnMobile} items-center justify-center`}
      >
        <EmptyState
          icon={Mail}
          title="Inbox is empty"
          description="Sync this Gmail account to pull emails from the last 3 days."
          actionLabel="Sync this account"
          onAction={onRefresh}
        />
      </ListShell>
    );
  }

  return (
    <ListShell {...shellProps} className={`${hiddenOnMobile} overflow-hidden`}>
      <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink tracking-wide">
          Inbox
          <span className="text-muted font-normal ml-1.5">
            {visibleEmails.length}
            {visibleEmails.length !== emails.length ? ` / ${emails.length}` : ""}
          </span>
        </p>
        {(emailsSyncing || emailsRecategorizing || anySyncing) && (
          <span className="flex items-center gap-1.5 text-[11px] text-accent font-medium tabular-nums max-w-[65%] truncate">
            <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
            {statusLabel || "Syncing…"}
          </span>
        )}
      </div>

      <div className="shrink-0 border-b border-border bg-card px-3 py-2 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sender, email or subject"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-surface text-ink placeholder:text-muted/70 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex-1 min-w-0 py-1 px-2 text-[11px] rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All categories</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortByPriority((v) => !v)}
            title="Sort high priority first"
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border transition-colors ${
              sortByPriority
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-muted hover:text-ink"
            }`}
          >
            Priority sort
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {PRIORITY_FILTERS.map((p) => {
            const active = priorityFilter === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriorityFilter(p)}
                className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border transition-colors ${
                  active
                    ? PRIORITY_CHIP[p]
                    : "bg-surface text-muted border-border hover:text-ink"
                }`}
              >
                {p === "all" ? "All" : p}
              </button>
            );
          })}
        </div>
      </div>

      {emails.length === 0 && (emailsSyncing || anySyncing) ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm gap-2 px-4 text-center">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span className="tabular-nums">
            {statusLabel || "Fetching emails…"}
          </span>
        </div>
      ) : visibleEmails.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted text-xs px-6 text-center gap-2">
          <span>
            {filtersActive
              ? "No emails match your search or filters."
              : "No emails to show."}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategoryFilter("all");
                setPriorityFilter("all");
              }}
              className="text-accent hover:text-accent-hover font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/80">
          {visibleEmails.map((email) => {
            const isActive = selectedEmailId === email.id;
            const preview = stripHtml(email.body_preview).slice(0, 90);
            const sender = formatSender(email.from_address);

            return (
              <button
                key={email.id}
                type="button"
                onClick={() => setSelectedEmailId(email.id)}
                className={`w-full text-left px-4 py-2.5 transition-colors border-l-[3px] ${
                  isActive
                    ? "bg-card border-l-accent"
                    : "border-l-transparent hover:bg-card/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[13px] leading-snug truncate ${
                        isActive ? "font-semibold text-ink" : "font-medium text-ink/90"
                      }`}
                    >
                      {email.subject || "(No Subject)"}
                    </p>
                    {email.is_done && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 mr-1">
                        Done
                      </span>
                    )}
                    {(email.has_reply || email.replied_at) && (
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                        Reply given
                      </span>
                    )}
                  </div>
                  {email.date && (
                    <span className="text-[11px] text-muted shrink-0 pt-px">
                      {formatEmailDate(email.date)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 min-w-0">
                  <p className="text-xs text-muted truncate flex-1">{sender}</p>
                  <CategoryBadge
                    name={email.category_name}
                    priority={email.category_priority}
                    compact
                  />
                </div>
                {preview && (
                  <p className="text-[11px] text-muted/70 truncate mt-0.5 leading-relaxed">
                    {preview}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </ListShell>
  );
}
