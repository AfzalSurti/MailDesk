import { useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, { getSavedAccountId } from "../store/useStore";

const POLL_MS = 800;

export function useDashboardData() {
  const {
    selectedAccount,
    emails,
    emailsLoading,
    emailsSyncing,
    setAccounts,
    setCategories,
    setSelectedAccount,
    setEmails,
    setEmailsLoading,
    setEmailsSyncing,
    setSelectedEmail,
  } = useStore();

  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshEmails = useCallback(
    async (accountId, { silent = false } = {}) => {
      if (!silent) setEmailsLoading(true);
      try {
        const res = await api.get(`/emails/${accountId}`);
        setEmails(res.data.emails || []);
      } catch {
        if (!silent) {
          toast.error("Failed to load saved emails");
          setEmails([]);
        }
      } finally {
        if (!silent) setEmailsLoading(false);
      }
    },
    [setEmails, setEmailsLoading]
  );

  const startPolling = useCallback(
    (accountId) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        refreshEmails(accountId, { silent: true });
      }, POLL_MS);
    },
    [refreshEmails, stopPolling]
  );

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
    return stopPolling;
  }, [setAccounts, setCategories, setSelectedAccount, stopPolling]);

  useEffect(() => {
    if (!selectedAccount) {
      setEmails([]);
      return;
    }
    setSelectedEmail(null);
    refreshEmails(selectedAccount.id);
  }, [selectedAccount?.id, refreshEmails, setEmails, setSelectedEmail]);

  const syncEmails = useCallback(async () => {
    if (!selectedAccount || emailsSyncing) return;

    setEmailsSyncing(true);
    startPolling(selectedAccount.id);

    try {
      const res = await api.post(`/emails/${selectedAccount.id}/sync`);
      setEmails(res.data.emails || []);
      toast.success(
        `Synced ${res.data.emails?.length || 0} emails from the last 3 days`
      );
    } catch {
      toast.error("Failed to sync emails from Gmail");
    } finally {
      stopPolling();
      setEmailsSyncing(false);
    }
  }, [
    selectedAccount,
    emailsSyncing,
    setEmails,
    setEmailsSyncing,
    startPolling,
    stopPolling,
  ]);

  return {
    selectedAccount,
    emails,
    emailsLoading,
    emailsSyncing,
    syncEmails,
  };
}
