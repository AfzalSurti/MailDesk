import { Mail, RefreshCw } from "lucide-react";
import useStore from "../store/useStore";

export default function EmailList({ onRefresh }) {
  const { emails, emailsLoading, selectedAccount } = useStore();

  if (!selectedAccount) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Select a Gmail account from the sidebar
      </div>
    );
  }

  if (emailsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Fetching emails...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <Mail className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No emails loaded yet</p>
        <button
          onClick={onRefresh}
          className="mt-4 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-600"
        >
          Fetch Emails
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-3">
      {emails.map((email) => (
        <div
          key={email.id}
          className="bg-card border border-border rounded-xl p-4 hover:border-accent/50 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{email.subject}</p>
              <p className="text-xs text-gray-500 mt-1 truncate">{email.from_address}</p>
              <p className="text-sm text-gray-400 mt-2 line-clamp-2">{email.body_preview}</p>
            </div>
            {email.date && (
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                {email.date}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
