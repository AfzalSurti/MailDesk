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
    emailsRecategorizing,
    setAccounts,
    setCategories,
    setSelectedAccount,
    setEmails,
    setEmailsLoading,
    setEmailsSyncing,
    setEmailsRecategorizing,
    setSelectedEmailId,
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
      const accPromise = api.get("/accounts/").then((res) => {
        setAccounts(res.data);
        return res.data;
      }).catch(() => {
        toast.error("Failed to load accounts");
        return [];
      });

      const catPromise = api.get("/categories/").then((res) => {
        setCategories(res.data);
        return res.data;
      }).catch(() => {
        toast.error("Failed to load categories");
        return [];
      });

      const [accounts] = await Promise.all([accPromise, catPromise]);

      const savedId = getSavedAccountId();
      const restored =
        accounts.find((a) => a.id === savedId) ?? accounts[0] ?? null;
      if (restored) {
        setSelectedAccount(restored);
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
    setSelectedEmailId(null);
    refreshEmails(selectedAccount.id);
  }, [selectedAccount?.id, refreshEmails, setEmails, setSelectedEmailId]);

  const syncEmails = useCallback(async () => {
    if (!selectedAccount || emailsSyncing || emailsRecategorizing) return;

    setEmailsSyncing(true);
    startPolling(selectedAccount.id);

    try {
      const res = await api.post(`/emails/${selectedAccount.id}/sync`);
      setEmails(res.data.emails || []);
      toast.success(
        `Synced ${res.data.emails?.length || 0} emails from the last 3 days`
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : "Failed to sync emails from Gmail"
      );
    } finally {
      stopPolling();
      setEmailsSyncing(false);
    }
  }, [
    selectedAccount,
    emailsSyncing,
    setEmails,
    setEmailsSyncing,
    emailsRecategorizing,
    setEmailsRecategorizing,
    startPolling,
    stopPolling,
  ]);

  const recategorizeAll = useCallback(async () => {
    if (!selectedAccount || emailsRecategorizing || emailsSyncing) return;

    setEmailsRecategorizing(true);
    startPolling(selectedAccount.id);

    try {
      const res = await api.post(`/emails/${selectedAccount.id}/recategorize`);
      setEmails(res.data.emails || []);
      toast.success(`Re-categorized ${res.data.emails?.length || 0} emails`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : "Bulk re-categorization failed"
      );
    } finally {
      stopPolling();
      setEmailsRecategorizing(false);
    }
  }, [
    selectedAccount,
    emailsRecategorizing,
    emailsSyncing,
    setEmails,
    setEmailsRecategorizing,
    startPolling,
    stopPolling,
  ]);

  return {
    selectedAccount,
    emails,
    emailsLoading,
    emailsSyncing,
    emailsRecategorizing,
    syncEmails,
    recategorizeAll,
  };
}
