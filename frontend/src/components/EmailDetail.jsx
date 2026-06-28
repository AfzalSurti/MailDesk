import { Mail, X } from "lucide-react";
import useStore from "../store/useStore";
import { stripHtml } from "../utils/stripHtml";

export default function EmailDetail() {
  const { selectedEmail, setSelectedEmail } = useStore();

  if (!selectedEmail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface border-l border-border text-muted">
        <Mail className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">Select an email to read</p>
      </div>
    );
  }

  const fullBody = stripHtml(selectedEmail.body || selectedEmail.body_preview);

  return (
    <div className="flex-1 flex flex-col bg-card border-l border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">{selectedEmail.subject}</h3>
          <p className="text-sm text-muted mt-1">{selectedEmail.from_address}</p>
          {selectedEmail.date && (
            <p className="text-xs text-muted/70 mt-1">{selectedEmail.date}</p>
          )}
        </div>
        <button
          onClick={() => setSelectedEmail(null)}
          className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
          aria-label="Close email"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{fullBody}</p>
      </div>
    </div>
  );
}
