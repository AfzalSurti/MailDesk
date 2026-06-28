import { useEffect, useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import useStore, { getSavedAccountId } from "../store/useStore";
import api from "../lib/axios";
import Sidebar from "../components/Sidebar";
import EmailList from "../components/EmailList";
import EmailDetail from "../components/EmailDetail";
import SettingsModal from "../components/SettingsModal";
import CategoryModal from "../components/CategoryModal";

export default function DashboardPage() {
  const {
    setAccounts,
    setCategories,
    setSelectedAccount,
    selectedAccount,
    emails,
    emailsLoading,
    setEmails,
    setEmailsLoading,
    setSelectedEmail,
  } = useStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          api.get("/accounts/"),
          api.get("/categories/"),
        ]);
        setAccounts(accRes.data);
        setCategories(catRes.data);

        const savedId = getSavedAccountId();
        const restored =
          accRes.data.find((a) => a.id === savedId) ?? accRes.data[0] ?? null;
        if (restored) {
          setSelectedAccount(restored);
        }
      } catch {
        toast.error("Failed to load data");
      }
    };
    load();
  }, []);

  const loadStoredEmails = async (accountId) => {
    setEmailsLoading(true);
    try {
      const res = await api.get(`/emails/${accountId}`);
      setEmails(res.data.emails || []);
    } catch {
      toast.error("Failed to load saved emails");
      setEmails([]);
    } finally {
      setEmailsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedAccount) {
      setEmails([]);
      return;
    }
    setSelectedEmail(null);
    loadStoredEmails(selectedAccount.id);
  }, [selectedAccount?.id]);

  const syncEmails = async () => {
    if (!selectedAccount) return;
    setSelectedEmail(null);
    setEmailsLoading(true);
    try {
      const res = await api.post(`/emails/${selectedAccount.id}/sync`);
      setEmails(res.data.emails || []);
      toast.success(`Synced ${res.data.emails?.length || 0} emails from the last 3 days`);
    } catch {
      toast.error("Failed to sync emails from Gmail");
    } finally {
      setEmailsLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-card border-b border-border px-4 md:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-surface shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink truncate">
                  {selectedAccount
                    ? selectedAccount.display_name || selectedAccount.email_address
                    : "Select an account"}
                </h2>
                {selectedAccount && (
                  <p className="text-xs text-muted font-mono mt-0.5 truncate">
                    {selectedAccount.email_address}
                  </p>
                )}
                {selectedAccount && emails.length > 0 && (
                  <p className="text-xs text-muted mt-1">{emails.length} emails saved</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCategoryOpen(true)}
                className="btn-secondary hidden sm:inline-flex"
              >
                Categories
              </button>
              {selectedAccount && (
                <button
                  type="button"
                  onClick={syncEmails}
                  disabled={emailsLoading}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  {emailsLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {emailsLoading ? "Syncing..." : "Sync"}
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-3 sm:hidden">
            <button
              type="button"
              onClick={() => setCategoryOpen(true)}
              className="btn-secondary flex-1"
            >
              Categories
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <EmailList onRefresh={syncEmails} />
          <EmailDetail />
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {categoryOpen && <CategoryModal onClose={() => setCategoryOpen(false)} />}
    </div>
  );
}
