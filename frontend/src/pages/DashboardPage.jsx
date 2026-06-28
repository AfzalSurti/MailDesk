import { useState } from "react";
import Sidebar from "../components/Sidebar";
import EmailList from "../components/EmailList";
import EmailDetail from "../components/EmailDetail";
import SettingsModal from "../components/SettingsModal";
import CategoryModal from "../components/CategoryModal";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import { useDashboardData } from "../hooks/useDashboardData";

export default function DashboardPage() {
  const {
    selectedAccount,
    emailsSyncing,
    emailsRecategorizing,
    syncEmails,
    recategorizeAll,
  } = useDashboardData();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <DashboardHeader
          selectedAccount={selectedAccount}
          emailsSyncing={emailsSyncing || emailsRecategorizing}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenCategories={() => setCategoryOpen(true)}
          onSync={syncEmails}
        />

        <div className="flex-1 flex overflow-hidden min-h-0">
          <EmailList onRefresh={syncEmails} />
          <EmailDetail />
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {categoryOpen && (
        <CategoryModal
          onClose={() => setCategoryOpen(false)}
          selectedAccount={selectedAccount}
          onRecategorizeAll={recategorizeAll}
          recategorizing={emailsRecategorizing}
          syncing={emailsSyncing}
        />
      )}
    </div>
  );
}
