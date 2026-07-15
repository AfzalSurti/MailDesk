import { useState, useMemo } from "react";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, Reply, Sparkles, X } from "lucide-react";
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
  const [updatingStatus, setUpdatingStatus] = useState(false);

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

  const updateEmailsFromResponse = (res) => {
    setEmails(res.data.emails || []);
  };

  const markDone = async (nextDoneState) => {
    if (!selectedAccount || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await api.patch(
        `/emails/${selectedAccount.id}/${selectedEmail.id}/status`,
        { is_done: nextDoneState }
      );
      updateEmailsFromResponse(res);
      toast.success(nextDoneState ? "Marked as done" : "Marked as open");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update email status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const replyInGmail = async () => {
    if (!selectedAccount || updatingStatus) return;

    const subject = encodeURIComponent(
      selectedEmail.subject?.startsWith("Re:")
        ? selectedEmail.subject
        : `Re: ${selectedEmail.subject || ""}`
    );
    const to = encodeURIComponent(selectedEmail.from_address || "");
    const replyUrl =
      `https://mail.google.com/mail/?view=cm&fs=1&tf=1` +
      `&authuser=${encodeURIComponent(selectedAccount.email_address)}` +
      `&to=${to}&su=${subject}`;

    window.open(replyUrl, "_blank", "noopener,noreferrer");

    const shouldMarkDone = window.confirm(
      "Reply window opened in Gmail. Mark this email as done now?"
    );
    if (!shouldMarkDone) return;

    setUpdatingStatus(true);
    try {
      const res = await api.post(
        `/emails/${selectedAccount.id}/${selectedEmail.id}/reply-done`,
        { mark_done: true }
      );
      updateEmailsFromResponse(res);
      toast.success("Reply noted and email marked as done");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update reply status");
    } finally {
      setUpdatingStatus(false);
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
              {selectedEmail.is_done && (
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Done
                </span>
              )}
              {(selectedEmail.has_reply || selectedEmail.replied_at) && (
                <span className="text-[11px] font-medium text-sky-800 bg-sky-100 px-2 py-0.5 rounded-full">
                  Reply already given
                </span>
              )}
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
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={replyInGmail}
                disabled={updatingStatus}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Reply className="w-4 h-4" />
                Reply from this inbox
              </button>
              <button
                type="button"
                onClick={() => markDone(!selectedEmail.is_done)}
                disabled={updatingStatus}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {selectedEmail.is_done ? "Mark as open" : "Mark as done"}
              </button>
            </div>
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
        <div className="max-w-3xl space-y-8">
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

          {(selectedEmail.has_reply || selectedEmail.reply_body || selectedEmail.reply_body_html) && (
            <section className="border-t border-border pt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-ink">Your reply</h4>
                {selectedEmail.reply_at && (
                  <span className="text-[11px] text-muted">{selectedEmail.reply_at}</span>
                )}
              </div>
              {selectedEmail.reply_subject && (
                <p className="text-xs text-muted mb-2">{selectedEmail.reply_subject}</p>
              )}
              {sanitizeEmailHtml(selectedEmail.reply_body_html) ? (
                <div
                  className="email-body-content rounded-xl border border-sky-100 bg-sky-50/40 p-4"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(selectedEmail.reply_body_html),
                  }}
                />
              ) : (
                <p className="text-sm text-ink leading-7 whitespace-pre-wrap break-words rounded-xl border border-sky-100 bg-sky-50/40 p-4">
                  {selectedEmail.reply_body || "Reply detected for this email."}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
