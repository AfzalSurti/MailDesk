import { Mail, RefreshCw } from "lucide-react";
import useStore from "../store/useStore";
import { stripHtml } from "../utils/stripHtml";

const listWidth = "w-full md:w-[340px] lg:w-[380px] shrink-0";

function EmptyPanel({ children }) {
  return (
    <div className={`${listWidth} flex flex-col items-center justify-center text-muted border-r border-border bg-surface p-6 text-center`}>
      {children}
    </div>
  );
}

export default function EmailList({ onRefresh }) {
  const { emails, emailsLoading, selectedAccount, selectedEmail, setSelectedEmail } = useStore();

  const panelClass = `${listWidth} border-r border-border bg-surface ${
    selectedEmail ? "hidden md:flex md:flex-col" : "flex flex-col"
  }`;

  if (!selectedAccount) {
    return (
      <EmptyPanel>
        <p className="text-sm">Select a Gmail account from the sidebar</p>
      </EmptyPanel>
    );
  }

  if (emailsLoading) {
    return (
      <div className={`${panelClass} items-center justify-center text-muted text-sm min-h-0`}>
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Fetching emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyPanel>
        <Mail className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No emails loaded yet</p>
        <button type="button" onClick={onRefresh} className="btn-primary mt-4">
          Fetch Emails
        </button>
      </EmptyPanel>
    );
  }

  return (
    <div className={`${panelClass} overflow-hidden min-h-0`}>
      <div className="px-4 py-3 border-b border-border bg-card/50">
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
                    {email.date.split(",")[0]}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
