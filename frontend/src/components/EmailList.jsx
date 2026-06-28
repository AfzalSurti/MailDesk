import { Inbox, Mail, RefreshCw } from "lucide-react";
import useStore from "../store/useStore";
import { stripHtml } from "../utils/stripHtml";
import { formatEmailDate, formatSender } from "../utils/format";
import EmptyState from "./ui/EmptyState";
import CategoryBadge from "./ui/CategoryBadge";

const LIST_WIDTH = "w-full md:w-[320px] lg:w-[360px] shrink-0";

function ListShell({ children, className = "" }) {
  return (
    <div
      className={`${LIST_WIDTH} border-r border-border bg-surface flex flex-col min-h-0 ${className}`}
    >
      {children}
    </div>
  );
}

export default function EmailList({ onRefresh }) {
  const {
    emails,
    emailsLoading,
    emailsSyncing,
    emailsRecategorizing,
    selectedAccount,
    selectedEmailId,
    setSelectedEmailId,
  } = useStore();

  const hiddenOnMobile = selectedEmailId ? "hidden md:flex" : "flex";
  const showInitialLoader = emailsLoading && emails.length === 0 && !emailsSyncing;

  if (!selectedAccount) {
    return (
      <ListShell className="items-center justify-center">
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
      <ListShell className={`${hiddenOnMobile} items-center justify-center`}>
        <div className="flex items-center gap-2 text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading inbox...
        </div>
      </ListShell>
    );
  }

  if (emails.length === 0 && !emailsSyncing) {
    return (
      <ListShell className={`${hiddenOnMobile} items-center justify-center`}>
        <EmptyState
          icon={Mail}
          title="Inbox is empty"
          description="Sync from Gmail to pull emails from the last 3 days."
          actionLabel="Sync from Gmail"
          onAction={onRefresh}
        />
      </ListShell>
    );
  }

  return (
    <ListShell className={`${hiddenOnMobile} overflow-hidden`}>
      <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink tracking-wide">
          Inbox
          <span className="text-muted font-normal ml-1.5">{emails.length}</span>
        </p>
        {(emailsSyncing || emailsRecategorizing) && (
          <span className="flex items-center gap-1.5 text-[11px] text-accent font-medium">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {emailsRecategorizing ? "Re-categorizing" : "Syncing"}
          </span>
        )}
      </div>

      {emails.length === 0 && emailsSyncing ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Fetching emails...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/80">
          {emails.map((email) => {
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
                  <p
                    className={`text-[13px] leading-snug truncate flex-1 ${
                      isActive ? "font-semibold text-ink" : "font-medium text-ink/90"
                    }`}
                  >
                    {email.subject || "(No Subject)"}
                  </p>
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
