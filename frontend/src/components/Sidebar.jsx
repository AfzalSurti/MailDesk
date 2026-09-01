import { useMemo, useState } from "react";
import {
  LogOut,
  Settings,
  Home,
  Inbox,
  X,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import useStore, { isAccountSyncing, isAnyAccountSyncing } from "../store/useStore";
import { Link, useNavigate } from "react-router-dom";
import { getInitials } from "../utils/format";
import EmptyState from "./ui/EmptyState";

function AccountRow({ acc, isActive, anySyncing, onPick, onSyncAccount }) {
  const isSyncing = useStore((s) => isAccountSyncing(s, acc.id));
  const initials = getInitials(acc.display_name, acc.email_address);

  return (
    <div
      className={`sidebar-account flex items-center gap-1 px-2 py-2 rounded-xl transition-all ${
        isActive ? "bg-white/10 ring-1 ring-white/10" : "hover:bg-white/5"
      }`}
    >
      <button
        type="button"
        onClick={() => onPick(acc)}
        className="flex-1 min-w-0 text-left flex items-center gap-3 px-1 py-1"
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
            isActive ? "bg-accent text-white" : "bg-white/10 text-white/70"
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
      {typeof onSyncAccount === "function" && (
        <button
          type="button"
          title={`Sync ${acc.email_address}`}
          disabled={anySyncing}
          onClick={(e) => {
            e.stopPropagation();
            onSyncAccount(acc.id);
          }}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-40 shrink-0"
          aria-label={`Sync ${acc.email_address}`}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-accent" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ open, onClose, onSettingsOpen, onSyncAccount }) {
  const accounts = useStore((s) => s.accounts);
  const selectedAccount = useStore((s) => s.selectedAccount);
  const setSelectedAccount = useStore((s) => s.setSelectedAccount);
  const logout = useStore((s) => s.logout);
  const user = useStore((s) => s.user);
  const anySyncing = useStore((s) => isAnyAccountSyncing(s));
  const navigate = useNavigate();
  const [accountQuery, setAccountQuery] = useState("");

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      `${a.display_name || ""} ${a.email_address || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [accounts, accountQuery]);

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
      className={`no-print fixed md:static inset-y-0 left-0 z-50 w-72 bg-sidebar flex flex-col shrink-0 transform transition-transform duration-200 ease-out ${
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
            {accountQuery
              ? `${filteredAccounts.length}/${accounts.length}`
              : accounts.length}
          </span>
        </div>

        {accounts.length > 0 && (
          <div className="px-5 mb-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                type="text"
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                placeholder="Search name or email"
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {accountQuery && (
                <button
                  type="button"
                  onClick={() => setAccountQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                  aria-label="Clear account search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

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
        ) : filteredAccounts.length === 0 ? (
          <p className="px-5 text-xs text-white/40">
            No accounts match “{accountQuery}”.
          </p>
        ) : (
          <div className="space-y-1 px-3">
            {filteredAccounts.map((acc) => (
              <AccountRow
                key={acc.id}
                acc={acc}
                isActive={selectedAccount?.id === acc.id}
                anySyncing={anySyncing}
                onPick={pickAccount}
                onSyncAccount={onSyncAccount}
              />
            ))}
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
