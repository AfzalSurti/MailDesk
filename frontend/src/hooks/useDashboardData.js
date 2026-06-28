import { useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, { getSavedAccountId } from "../store/useStore";

export function useDashboardData() {
  const {
    selectedAccount,
    emails,
    emailsLoading,
    setAccounts,
    setCategories,
    setSelectedAccount,
    setEmails,
    setEmailsLoading,
    setSelectedEmail,
  } = useStore();

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
        toast.error("Failed to load dashboard data");
      }
    };
    load();
  }, [setAccounts, setCategories, setSelectedAccount]);

  const loadStoredEmails = useCallback(
    async (accountId) => {
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
    },
    [setEmails, setEmailsLoading]
  );

  useEffect(() => {
    if (!selectedAccount) {
      setEmails([]);
      return;
    }
    setSelectedEmail(null);
    loadStoredEmails(selectedAccount.id);
  }, [selectedAccount?.id, loadStoredEmails, setEmails, setSelectedEmail]);

  const syncEmails = useCallback(async () => {
    if (!selectedAccount) return;
    setSelectedEmail(null);
    setEmailsLoading(true);
    try {
      const res = await api.post(`/emails/${selectedAccount.id}/sync`);
      setEmails(res.data.emails || []);
      toast.success(
        `Synced ${res.data.emails?.length || 0} emails from the last 3 days`
      );
    } catch {
      toast.error("Failed to sync emails from Gmail");
    } finally {
      setEmailsLoading(false);
    }
  }, [selectedAccount, setEmails, setEmailsLoading, setSelectedEmail]);

  return {
    selectedAccount,
    emails,
    emailsLoading,
    syncEmails,
  };
}
