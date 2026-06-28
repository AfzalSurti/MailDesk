import { LogOut, Settings, Home, Inbox } from "lucide-react";
import useStore from "../store/useStore";
import { Link, useNavigate } from "react-router-dom";

export default function Sidebar({ open, onClose, onSettingsOpen }) {
  const { accounts, selectedAccount, setSelectedAccount, logout } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const pickAccount = (account) => {
    setSelectedAccount(account);
    onClose();
  };

  return (
    <aside
      className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-sidebar flex flex-col shrink-0 transform transition-transform duration-200 ease-out ${
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
    >
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Inbox className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg">MailDesk</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider px-6 mb-2">
          Accounts ({accounts.length})
        </p>
        {accounts.length === 0 && (
          <p className="text-white/30 text-sm px-6 mt-2 leading-relaxed">
            No accounts yet. Open Settings to add Gmail.
          </p>
        )}
        {accounts.map((acc) => {
          const isActive = selectedAccount?.id === acc.id;
          return (
            <button
              key={acc.id}
              onClick={() => pickAccount(acc)}
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
        <Link
          to="/"
          onClick={onClose}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-sm"
        >
          <Home className="w-4 h-4" />
          Home
        </Link>
        <button
          onClick={() => {
            onSettingsOpen();
            onClose();
          }}
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
    </aside>
  );
}
