import { useState } from "react";
import { Mail, Trash2 } from "lucide-react";
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

  const deleteAccount = async (id) => {
    try {
      await api.delete(`/accounts/${id}`);
      const remaining = accounts.filter((a) => a.id !== id);
      setAccounts(remaining);
      if (selectedAccount?.id === id) {
        setSelectedAccount(remaining[0] ?? null);
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
          <p className="text-xs text-muted mb-4 leading-relaxed">
            Use a Google App Password (not your regular Gmail password). Enable 2FA first,
            then create one under Google Account → Security → App passwords.
          </p>
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
          <h3 className="text-sm font-semibold text-ink mb-3">
            Connected Accounts ({accounts.length})
          </h3>
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
                <div key={acc.id} className="list-item">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {acc.display_name || acc.email_address}
                    </p>
                    <p className="text-xs text-muted font-mono truncate mt-0.5">
                      {acc.email_address}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAccount(acc.id)}
                    className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    aria-label="Remove account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
