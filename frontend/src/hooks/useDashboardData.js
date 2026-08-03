import { useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, { getSavedAccountId } from "../store/useStore";

const JOB_POLL_MS = 1200;
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

/** Merge slim list rows while keeping any already-loaded full bodies. */
function mergeEmailList(previous, nextList) {
  const prevById = Object.fromEntries((previous || []).map((e) => [e.id, e]));
  return (nextList || []).map((row) => {
    const prev = prevById[row.id];
    if (prev?.bodyLoaded) {
      return {
        ...row,
        body: prev.body,
        body_html: prev.body_html,
        reply_body: prev.reply_body,
        reply_body_html: prev.reply_body_html,
        bodyLoaded: true,
      };
    }
    return { ...row, bodyLoaded: false };
  });
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

  const emailsRef = useRef(emails);
  useEffect(() => {
    emailsRef.current = emails;
  }, [emails]);

  const refreshEmails = useCallback(
    async (accountId, { silent = false } = {}) => {
      if (!silent) setEmailsLoading(true);
      try {
        const res = await api.get(`/emails/${accountId}`);
        setEmails(mergeEmailList(emailsRef.current, res.data.emails || []));
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

  useEffect(() => {
    const load = async () => {
      const accounts = await api
        .get("/accounts/")
        .then((res) => {
          setAccounts(res.data);
          return res.data;
        })
        .catch(() => {
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
  }, [setAccounts, setSelectedAccount]);

  // Clicking a mail ID loads its inbox from DB only (no re-categorize)
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
    try {
      const { data: queued } = await api.post(
        `/emails/${selectedAccount.id}/sync`
      );
      // Poll job status only — do not refetch full inbox every 800ms
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
      setEmailsSyncing(false);
    }
  }, [
    selectedAccount,
    emailsSyncing,
    emailsRecategorizing,
    setEmailsSyncing,
    refreshEmails,
  ]);

  const recategorizeAll = useCallback(async () => {
    if (!selectedAccount || emailsRecategorizing || emailsSyncing) return;

    setEmailsRecategorizing(true);
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
      setEmailsRecategorizing(false);
    }
  }, [
    selectedAccount,
    emailsRecategorizing,
    emailsSyncing,
    setEmailsRecategorizing,
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
