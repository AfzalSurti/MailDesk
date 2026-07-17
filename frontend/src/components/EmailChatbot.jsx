import { MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";

const SUGGESTIONS = [
  "Summarize yesterday's important emails",
  "Which emails still need a reply?",
  "List high priority emails",
  "Who emailed me today?",
];

export default function EmailChatbot({ account, open, onOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setMessages([
      {
        role: "assistant",
        content:
          "Ask me anything about the synced emails for this inbox — summaries, unreplied mail, priorities, and more.",
      },
    ]);
    setInput("");
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, account?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!account) return null;

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || loading) return;

    const nextHistory = [...messages, { role: "user", content: question }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    try {
      const history = nextHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .slice(-6)
        .map(({ role, content }) => ({ role, content }));

      const { data } = await api.post(`/emails/${account.id}/chat`, {
        message: question,
        history,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Chat failed");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry — I couldn't answer that right now. Try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,380px)] h-[min(70vh,560px)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Email Assistant"
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-card">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10">
                  <MessageCircle className="w-3.5 h-3.5 text-accent" />
                </span>
                <h3 className="text-sm font-semibold text-ink">Email Assistant</h3>
              </div>
              <p className="text-[11px] text-muted truncate mt-0.5 pl-9">
                {account.display_name || account.email_address}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-surface/40">
            {messages.map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}`}
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "ml-auto bg-accent text-white rounded-br-md"
                    : "bg-card text-ink border border-border rounded-bl-md shadow-sm"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="inline-flex items-center gap-2 text-xs text-muted px-1">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0 bg-surface/40">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  disabled={loading}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-card text-muted hover:text-ink hover:bg-surface"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="p-2.5 border-t border-border flex items-center gap-2 shrink-0 bg-card"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this inbox…"
              className="input-field flex-1 text-sm py-2"
              disabled={loading}
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-primary p-2.5 shrink-0"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={open ? onClose : onOpen}
        className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${
          open
            ? "bg-ink text-white"
            : "bg-accent text-white"
        }`}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
