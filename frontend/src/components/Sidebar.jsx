import { LogOut, Settings } from "lucide-react";
import useStore from "../store/useStore";
import { useNavigate } from "react-router-dom";

export default function Sidebar({ onSettingsOpen }) {
  const { accounts, selectedAccount, setSelectedAccount, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="w-72 min-h-screen bg-sidebar flex flex-col">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-white font-bold text-lg">MailDesk</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider px-6 mb-2">
          Accounts ({accounts.length})
        </p>
        {accounts.length === 0 && (
          <p className="text-white/30 text-sm px-6 mt-4">No accounts added yet</p>
        )}
        {accounts.map((acc) => {
          const isActive = selectedAccount?.id === acc.id;
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccount(acc)}
              className={`w-full text-left px-6 py-3 transition-colors ${
                isActive
                  ? "bg-white/10 border-l-2 border-accent"
                  : "hover:bg-white/5 border-l-2 border-transparent"
              }`}
            >
              <p className={`text-sm font-medium truncate ${isActive ? "text-white" : "text-white/70"}`}>
                {acc.display_name || acc.email_address}
              </p>
              <p className="text-xs text-white/40 font-mono truncate mt-0.5">
                {acc.email_address}
              </p>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-4 space-y-1">
        <button
          onClick={onSettingsOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/60 hover:text-red-400 hover:bg-white/10 text-sm"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}
