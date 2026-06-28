import { useState, useMemo } from "react";
import { ArrowLeft, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import useStore, { selectEmailById } from "../store/useStore";
import api from "../lib/axios";
import { sanitizeEmailHtml, stripHtml } from "../utils/stripHtml";
import EmptyState from "./ui/EmptyState";
import CategoryBadge from "./ui/CategoryBadge";

export default function EmailDetail() {
  const {
    selectedAccount,
    selectedEmailId,
    setSelectedEmailId,
    emails,
    setEmails,
    emailsSyncing,
  } = useStore();
  const [categorizing, setCategorizing] = useState(false);

  const selectedEmail = useMemo(
    () => selectEmailById(emails, selectedEmailId),
    [emails, selectedEmailId]
  );

  const panelClass = `flex-1 flex flex-col bg-card overflow-hidden min-h-0 min-w-0 ${
    selectedEmailId ? "flex" : "hidden md:flex"
  }`;

  if (!selectedEmailId) {
    return (
      <div className={`${panelClass} items-center justify-center border-l border-border`}>
        <EmptyState
          icon={Mail}
          title="Select an email"
          description="Choose a message from the inbox list to read it here."
        />
      </div>
    );
  }

  if (!selectedEmail) {
    return (
      <div className={`${panelClass} items-center justify-center border-l border-border`}>
        <div className="flex items-center gap-2 text-muted text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading email...
        </div>
      </div>
    );
  }

  const htmlBody = sanitizeEmailHtml(selectedEmail.body_html);
  const rawPlain = selectedEmail.body || selectedEmail.body_preview || "";
  const plainBody = /<[a-z][\s\S]*>/i.test(rawPlain) ? stripHtml(rawPlain) : rawPlain;

  const recategorize = async () => {
    if (!selectedAccount || categorizing) return;
    setCategorizing(true);
    try {
      const res = await api.post(
        `/emails/${selectedAccount.id}/${selectedEmail.id}/categorize`
      );
      const cat = res.data.category;
      setEmails(
        emails.map((e) =>
          e.id === selectedEmail.id
            ? {
                ...e,
                category_name: cat?.category_name,
                category_priority: cat?.priority,
                confidence_score: cat?.confidence_score,
              }
            : e
        )
      );
      toast.success(`Classified as ${cat?.category_name || "Unknown"}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "AI categorization failed"
      );
    } finally {
      setCategorizing(false);
    }
  };

  return (
    <div key={selectedEmail.id} className={`${panelClass} border-l border-border`}>
      <div className="px-4 md:px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setSelectedEmailId(null)}
            className="md:hidden p-2 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
            aria-label="Back to inbox"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CategoryBadge
                name={selectedEmail.category_name}
                priority={selectedEmail.category_priority}
                confidence={selectedEmail.confidence_score}
              />
              {!selectedEmail.category_name && emailsSyncing && (
                <span className="text-[11px] text-muted">Classifying...</span>
              )}
              <button
                type="button"
                onClick={recategorize}
                disabled={categorizing}
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover font-medium"
              >
                <Sparkles className="w-3 h-3" />
                {categorizing ? "Re-categorizing..." : "Re-categorize"}
              </button>
            </div>
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
            onClick={() => setSelectedEmailId(null)}
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
              key={`html-${selectedEmail.id}`}
              className="email-body-content"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            <p
              key={`plain-${selectedEmail.id}`}
              className="text-sm md:text-[15px] text-ink leading-7 whitespace-pre-wrap break-words"
            >
              {plainBody || "No content available."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
