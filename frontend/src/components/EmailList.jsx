import { Inbox, Mail, RefreshCw } from "lucide-react";
import useStore from "../store/useStore";
import { stripHtml } from "../utils/stripHtml";
import { formatEmailDate } from "../utils/format";
import EmptyState from "./ui/EmptyState";

const LIST_WIDTH = "w-full md:w-[340px] lg:w-[380px] shrink-0";

function ListShell({ children, className = "" }) {
  return (
    <div className={`${LIST_WIDTH} border-r border-border bg-surface flex flex-col ${className}`}>
      {children}
    </div>
  );
}

export default function EmailList({ onRefresh, onOpenSettings }) {
  const { emails, emailsLoading, selectedAccount, selectedEmail, setSelectedEmail } = useStore();

  const hiddenOnMobile = selectedEmail ? "hidden md:flex" : "flex";

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

  if (emailsLoading) {
    return (
      <ListShell className={`${hiddenOnMobile} items-center justify-center min-h-0`}>
        <div className="flex items-center gap-2 text-muted text-sm">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading emails...
        </div>
      </ListShell>
    );
  }

  if (emails.length === 0) {
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
    <ListShell className={`${hiddenOnMobile} overflow-hidden min-h-0`}>
      <div className="px-4 py-3 border-b border-border bg-card/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Inbox · {emails.length}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {emails.map((email) => {
          const isActive = selectedEmail?.id === email.id;
          const preview = stripHtml(email.body_preview).slice(0, 120);
          return (
            <button
              key={email.id}
              type="button"
              onClick={() => setSelectedEmail(email)}
              className={`w-full text-left rounded-xl p-4 border transition-all ${
                isActive
                  ? "bg-card border-accent shadow-sm ring-1 ring-accent/20"
                  : "bg-card border-border hover:border-accent/40 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink text-sm leading-snug line-clamp-2">
                    {email.subject || "(No Subject)"}
                  </p>
                  <p className="text-xs text-muted mt-1.5 truncate">{email.from_address}</p>
                  <p className="text-xs text-muted/80 mt-2 line-clamp-2 leading-relaxed">
                    {preview}
                  </p>
                </div>
                {email.date && (
                  <span className="text-[10px] text-muted/70 whitespace-nowrap shrink-0 pt-0.5">
                    {formatEmailDate(email.date)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ListShell>
  );
}
