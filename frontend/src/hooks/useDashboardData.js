import { useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, { getSavedAccountId } from "../store/useStore";

const POLL_MS = 800;
const JOB_POLL_MS = 1000;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

async function waitForJob(jobId) {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const { data } = await api.get(`/jobs/${jobId}`);
    if (data.status === "completed") return data;
    if (data.status === "failed") {
      const err = new Error(data.error || "Job failed");
      err.job = data;
      throw err;
    }
    await new Promise((r) => setTimeout(r, JOB_POLL_MS));
  }
  throw new Error("Job timed out");
}

export function useDashboardData() {
  const {
    selectedAccount,
    emails,
    emailsLoading,
    emailsSyncing,
    emailsRecategorizing,
    setAccounts,
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
      const accounts = await api.get("/accounts/").then((res) => {
        setAccounts(res.data);
        return res.data;
      }).catch(() => {
        toast.error("Failed to load accounts");
        return [];
      });

      const savedId = getSavedAccountId();
      const restored =
        accounts.find((a) => a.id === savedId) ?? accounts[0] ?? null;
      if (restored) {
        setSelectedAccount(restored);
      }
    };
    load();
    return stopPolling;
  }, [setAccounts, setSelectedAccount, stopPolling]);

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
      const { data: queued } = await api.post(
        `/emails/${selectedAccount.id}/sync`
      );
      const job = await waitForJob(queued.job_id);
      await refreshEmails(selectedAccount.id);
      toast.success(
        `Synced ${job.result?.count ?? 0} emails from the last 3 days`
      );
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
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
    emailsRecategorizing,
    setEmailsSyncing,
    startPolling,
    stopPolling,
    refreshEmails,
  ]);

  const recategorizeAll = useCallback(async () => {
    if (!selectedAccount || emailsRecategorizing || emailsSyncing) return;

    setEmailsRecategorizing(true);
    startPolling(selectedAccount.id);

    try {
      const { data: queued } = await api.post(
        `/emails/${selectedAccount.id}/recategorize`
      );
      const job = await waitForJob(queued.job_id);
      await refreshEmails(selectedAccount.id);
      toast.success(`Re-categorized ${job.result?.count ?? 0} emails`);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
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
    setEmailsRecategorizing,
    startPolling,
    stopPolling,
    refreshEmails,
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
