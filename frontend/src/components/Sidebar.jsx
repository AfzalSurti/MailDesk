import { LogOut, Settings, Home, Inbox, X, Plus } from "lucide-react";
import useStore from "../store/useStore";
import { Link, useNavigate } from "react-router-dom";
import { getInitials } from "../utils/format";
import EmptyState from "./ui/EmptyState";

export default function Sidebar({ open, onClose, onSettingsOpen }) {
  const { accounts, selectedAccount, setSelectedAccount, logout, user } = useStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to log out?")) {
      return;
    }
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
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shadow-sm">
            <Inbox className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-lg leading-none">MailDesk</span>
            <p className="text-white/40 text-[10px] mt-1 uppercase tracking-wider">
              Inbox Manager
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="md:hidden p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="flex items-center justify-between px-5 mb-3">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">
            Gmail Accounts
          </p>
          <span className="text-[10px] font-medium text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
            {accounts.length}
          </span>
        </div>

        {accounts.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={Inbox}
              title="No accounts connected"
              description="Add a Gmail account in Settings to start syncing emails."
              actionLabel="Add Account"
              onAction={() => {
                onSettingsOpen();
                onClose();
              }}
              compact
            />
          </div>
        ) : (
          <div className="space-y-1 px-3">
            {accounts.map((acc) => {
              const isActive = selectedAccount?.id === acc.id;
              const initials = getInitials(acc.display_name, acc.email_address);
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => pickAccount(acc)}
                  className={`sidebar-account w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                    isActive
                      ? "bg-white/10 ring-1 ring-white/10"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      isActive
                        ? "bg-accent text-white"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium truncate ${
                        isActive ? "text-white" : "text-white/75"
                      }`}
                    >
                      {acc.display_name || acc.email_address.split("@")[0]}
                    </p>
                    <p className="text-[11px] text-white/40 font-mono truncate mt-0.5">
                      {acc.email_address}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onSettingsOpen();
            onClose();
          }}
          className="mx-3 mt-3 w-[calc(100%-1.5rem)] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-white/15 text-white/50 hover:text-white hover:border-white/25 hover:bg-white/5 text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add account
        </button>
      </div>

      <div className="border-t border-white/10 p-3 space-y-0.5">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-white truncate">{user.name}</p>
            <p className="text-[10px] text-white/40 font-mono truncate">{user.email}</p>
          </div>
        )}
        <Link to="/" onClick={onClose} className="sidebar-nav-link">
          <Home className="w-4 h-4" />
          Home
        </Link>
        <button type="button" onClick={() => { onSettingsOpen(); onClose(); }} className="sidebar-nav-link">
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button type="button" onClick={handleLogout} className="sidebar-nav-link sidebar-nav-link-danger">
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
