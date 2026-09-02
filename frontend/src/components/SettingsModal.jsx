import { useState } from "react";
import { Mail, Trash2, Pencil, X, Check, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";
import Modal from "./ui/Modal";
import EmptyState from "./ui/EmptyState";

export default function SettingsModal({ onClose }) {
  const { accounts, setAccounts, selectedAccount, setSelectedAccount } = useStore();
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editAppPassword, setEditAppPassword] = useState("");
  const [savingId, setSavingId] = useState(null);

  const addAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/accounts/", {
        email_address: email,
        app_password: appPassword,
        display_name: displayName || undefined,
      });
      setAccounts([...accounts, data]);
      setSelectedAccount(data);
      toast.success("Gmail account added");
      setEmail("");
      setAppPassword("");
      setDisplayName("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add account");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (acc) => {
    setEditingId(acc.id);
    setEditDisplayName(acc.display_name || "");
    setEditAppPassword("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDisplayName("");
    setEditAppPassword("");
  };

  const saveEdit = async (acc) => {
    const payload = {};
    const trimmedName = editDisplayName.trim();
    const trimmedPassword = editAppPassword.trim();

    if (trimmedName !== (acc.display_name || "")) {
      payload.display_name = trimmedName;
    }
    if (trimmedPassword) {
      payload.app_password = trimmedPassword;
    }

    if (Object.keys(payload).length === 0) {
      toast.error("Change display name or enter a new app password");
      return;
    }

    setSavingId(acc.id);
    try {
      const { data } = await api.patch(`/accounts/${acc.id}`, payload);
      const updated = accounts.map((a) => (a.id === acc.id ? data : a));
      setAccounts(updated);
      if (selectedAccount?.id === acc.id) {
        setSelectedAccount(data);
      }
      toast.success("Account updated");
      cancelEdit();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update account");
    } finally {
      setSavingId(null);
    }
  };

  const deleteAccount = async (acc) => {
    const label = acc.display_name || acc.email_address;
    if (!window.confirm(`Remove "${label}"? Synced emails for this account will be deleted.`)) {
      return;
    }

    try {
      await api.delete(`/accounts/${acc.id}`);
      const remaining = accounts.filter((a) => a.id !== acc.id);
      setAccounts(remaining);
      if (selectedAccount?.id === acc.id) {
        setSelectedAccount(remaining[0] ?? null);
      }
      if (editingId === acc.id) {
        cancelEdit();
      }
      toast.success("Account removed");
    } catch {
      toast.error("Failed to remove account");
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-ink mb-1">Add Gmail Account</h3>
          <p className="text-xs text-muted mb-3 leading-relaxed">
            Gmail needs a <strong>16-character App Password</strong> — not your normal
            Gmail password. Here's how to get one:
          </p>

          <details
            open
            className="mb-4 rounded-lg border border-border bg-surface/60 p-3"
          >
            <summary className="cursor-pointer select-none text-xs font-medium text-ink">
              Step-by-step: connect your Gmail
            </summary>
            <ol className="mt-3 space-y-2 list-decimal pl-4 text-xs text-muted leading-relaxed">
              <li>
                Sign in to the Gmail you want to connect, then open{" "}
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  Google Account → Security
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </li>
              <li>
                Turn on{" "}
                <a
                  href="https://myaccount.google.com/signinoptions/twosv"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  2-Step Verification
                  <ExternalLink className="w-3 h-3" />
                </a>
                . App passwords only appear after this is enabled.
              </li>
              <li>
                Open{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline inline-flex items-center gap-0.5"
                >
                  App passwords
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </li>
              <li>
                Type a name like <strong>MailDesk</strong> and click{" "}
                <strong>Create</strong>. Google shows a 16-character password
                (4 blocks of 4).
              </li>
              <li>
                Copy it, remove the spaces, and paste it into{" "}
                <strong>App password</strong> below with your Gmail address. Then
                click <strong>Connect Account</strong>.
              </li>
            </ol>
            <p className="mt-2 text-[11px] text-muted">
              Don't see “App passwords”? Confirm 2-Step Verification is on. Some
              Google Workspace accounts need an admin to allow app passwords.
            </p>
          </details>

          <form onSubmit={addAccount} className="space-y-3">
            <div>
              <label className="field-label">Email address</label>
              <input
                type="email"
                placeholder="company@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">App password</label>
              <input
                type="password"
                placeholder="16-character app password"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="field-label">Display name (optional)</label>
              <input
                type="text"
                placeholder="e.g. Sales Inbox"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-field"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Connecting..." : "Connect Account"}
            </button>
          </form>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink mb-1">Manage Accounts</h3>
          <p className="text-xs text-muted mb-3">
            Edit display name or app password, or remove a connected inbox.
          </p>
          {accounts.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No accounts yet"
              description="Connect your first Gmail inbox above."
              compact
            />
          ) : (
            <div className="space-y-2">
              {accounts.map((acc) => (
                <div key={acc.id} className="list-item flex-col items-stretch gap-3">
                  {editingId === acc.id ? (
                    <div className="space-y-3 w-full">
                      <div>
                        <label className="field-label">Email</label>
                        <input
                          type="email"
                          value={acc.email_address}
                          className="input-field bg-surface text-muted"
                          disabled
                        />
                      </div>
                      <div>
                        <label className="field-label">Display name</label>
                        <input
                          type="text"
                          placeholder="e.g. Sales Inbox"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="field-label">New app password (optional)</label>
                        <input
                          type="password"
                          placeholder="Leave blank to keep current password"
                          value={editAppPassword}
                          onChange={(e) => setEditAppPassword(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(acc)}
                          disabled={savingId === acc.id}
                          className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          {savingId === acc.id ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingId === acc.id}
                          className="btn-secondary inline-flex items-center justify-center gap-2 px-4"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">
                          {acc.display_name || acc.email_address}
                        </p>
                        <p className="text-xs text-muted font-mono truncate mt-0.5">
                          {acc.email_address}
                        </p>
                      </div>
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(acc)}
                          className="p-2 text-muted hover:text-accent hover:bg-surface rounded-lg transition-colors"
                          aria-label="Edit account"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAccount(acc)}
                          className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Remove account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
