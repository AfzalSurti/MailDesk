import { useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore from "../store/useStore";

export default function SettingsModal({ onClose }) {
  const { accounts, setAccounts } = useStore();
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
      setAccounts(accounts.filter((a) => a.id !== id));
      toast.success("Account removed");
    } catch {
      toast.error("Failed to remove account");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-ink">Settings</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <form onSubmit={addAccount} className="space-y-3">
            <p className="text-sm font-medium text-ink">Add Gmail Account</p>
            <input
              type="email"
              placeholder="email@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              required
            />
            <input
              type="password"
              placeholder="App password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              className="input-field"
              required
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Adding..." : "Add Account"}
            </button>
          </form>

          {accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">Connected Accounts</p>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between px-3 py-2.5 bg-surface rounded-lg border border-border"
                >
                  <span className="text-sm text-ink truncate">{acc.email_address}</span>
                  <button
                    type="button"
                    onClick={() => deleteAccount(acc.id)}
                    className="text-xs text-red-600 hover:text-red-700 ml-2 shrink-0 font-medium"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
