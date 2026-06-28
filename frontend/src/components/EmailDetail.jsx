import { ArrowLeft, Mail, X } from "lucide-react";
import useStore from "../store/useStore";
import { sanitizeEmailHtml, stripHtml } from "../utils/stripHtml";

export default function EmailDetail() {
  const { selectedEmail, setSelectedEmail } = useStore();

  const panelClass = `flex-1 flex flex-col bg-card overflow-hidden min-h-0 min-w-0 ${
    selectedEmail ? "flex" : "hidden md:flex"
  }`;

  if (!selectedEmail) {
    return (
      <div className={`${panelClass} items-center justify-center border-l border-border text-muted`}>
        <Mail className="w-12 h-12 mb-3 opacity-25" />
        <p className="text-sm font-medium">Select an email to read</p>
        <p className="text-xs text-muted/70 mt-1">Choose a message from the inbox list</p>
      </div>
    );
  }

  const htmlBody = sanitizeEmailHtml(selectedEmail.body_html);
  const rawPlain = selectedEmail.body || selectedEmail.body_preview || "";
  const plainBody = /<[a-z][\s\S]*>/i.test(rawPlain) ? stripHtml(rawPlain) : rawPlain;

  return (
    <div className={`${panelClass} border-l border-border`}>
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setSelectedEmail(null)}
            className="md:hidden p-2 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
            aria-label="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="text-base md:text-lg font-semibold text-ink leading-snug">
              {selectedEmail.subject || "(No Subject)"}
            </h3>
            <p className="text-sm text-muted mt-2 break-all">{selectedEmail.from_address}</p>
            {selectedEmail.date && (
              <p className="text-xs text-muted/70 mt-1">{selectedEmail.date}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedEmail(null)}
            className="hidden md:block p-2 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
            aria-label="Close email"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-3xl">
          {htmlBody ? (
            <div
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            <p className="text-sm md:text-[15px] text-ink leading-7 whitespace-pre-wrap break-words">
              {plainBody || "No content available."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
