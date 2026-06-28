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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <form onSubmit={addAccount} className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Add Gmail Account</p>
            <input
              type="email"
              placeholder="email@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <input
              type="password"
              placeholder="App password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 rounded-lg text-sm disabled:opacity-60"
            >
              {loading ? "Adding..." : "Add Account"}
            </button>
          </form>

          {accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Connected Accounts</p>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
                >
                  <span className="text-sm text-gray-700 truncate">{acc.email_address}</span>
                  <button
                    onClick={() => deleteAccount(acc.id)}
                    className="text-xs text-red-500 hover:text-red-700 ml-2 shrink-0"
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
