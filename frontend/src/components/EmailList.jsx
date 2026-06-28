import { Mail, RefreshCw } from "lucide-react";
import useStore from "../store/useStore";

export default function EmailList({ onRefresh }) {
  const { emails, emailsLoading, selectedAccount, selectedEmail, setSelectedEmail } = useStore();

  if (!selectedAccount) {
    return (
      <div className="w-full md:w-2/5 lg:w-[380px] shrink-0 flex items-center justify-center text-muted text-sm border-r border-border bg-surface">
        Select a Gmail account from the sidebar
      </div>
    );
  }

  if (emailsLoading) {
    return (
      <div className="w-full md:w-2/5 lg:w-[380px] shrink-0 flex items-center justify-center text-muted text-sm border-r border-border bg-surface">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Fetching emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="w-full md:w-2/5 lg:w-[380px] shrink-0 flex flex-col items-center justify-center text-muted border-r border-border bg-surface">
        <Mail className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No emails loaded yet</p>
        <button
          onClick={onRefresh}
          className="mt-4 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover"
        >
          Fetch Emails
        </button>
      </div>
    );
  }

  return (
    <div className="w-full md:w-2/5 lg:w-[380px] shrink-0 overflow-y-auto border-r border-border bg-surface">
      <div className="p-3 space-y-2">
        {emails.map((email) => {
          const isActive = selectedEmail?.id === email.id;
          return (
            <button
              key={email.id}
              type="button"
              onClick={() => setSelectedEmail(email)}
              className={`w-full text-left rounded-xl p-4 border transition-colors ${
                isActive
                  ? "bg-card border-accent shadow-sm"
                  : "bg-card border-border hover:border-accent/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{email.subject}</p>
                  <p className="text-xs text-muted mt-1 truncate">{email.from_address}</p>
                  <p className="text-sm text-muted/80 mt-2 line-clamp-2">
                    {email.body_preview}
                  </p>
                </div>
                {email.date && (
                  <span className="text-[10px] text-muted whitespace-nowrap shrink-0 max-w-[80px] truncate">
                    {email.date.split(" ")[0]}
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
