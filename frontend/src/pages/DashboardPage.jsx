import { useEffect, useState } from "react";
import useStore from "../store/useStore";
import api from "../lib/axios";
import Sidebar from "../components/Sidebar";
import EmailList from "../components/EmailList";
import SettingsModal from "../components/SettingsModal";
import CategoryModal from "../components/CategoryModal";
import toast from "react-hot-toast";

export default function DashboardPage() {
  const { setAccounts, setCategories, selectedAccount, setEmails, setEmailsLoading } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [accRes, catRes] = await Promise.all([
          api.get("/accounts/"),
          api.get("/categories/"),
        ]);
        setAccounts(accRes.data);
        setCategories(catRes.data);
      } catch {
        toast.error("Failed to load data");
      }
    };
    load();
  }, []);

  const fetchEmails = async () => {
    if (!selectedAccount) return;
    setEmailsLoading(true);
    try {
      const res = await api.get(`/emails/${selectedAccount.id}`);
      setEmails(res.data.emails || []);
    } catch {
      toast.error("Failed to fetch emails");
    } finally {
      setEmailsLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onSettingsOpen={() => setSettingsOpen(true)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedAccount
                ? selectedAccount.display_name || selectedAccount.email_address
                : "Select an account"}
            </h2>
            {selectedAccount && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">
                {selectedAccount.email_address}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCategoryOpen(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Manage Categories
            </button>
            {selectedAccount && (
              <button
                onClick={fetchEmails}
                className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-blue-600"
              >
                Fetch Emails
              </button>
            )}
          </div>
        </div>

        <EmailList onRefresh={fetchEmails} />
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {categoryOpen && <CategoryModal onClose={() => setCategoryOpen(false)} />}
    </div>
  );
}
