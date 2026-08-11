import { useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, {
  getSavedAccountId,
  isAccountRecategorizing,
  isAccountSyncing,
} from "../store/useStore";

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

function withBodiesLoaded(list) {
  return (list || []).map((row) => ({ ...row, bodyLoaded: true }));
}

export function useDashboardData() {
  const selectedAccount = useStore((s) => s.selectedAccount);
  const emails = useStore((s) => s.emails);
  const emailsLoading = useStore((s) => s.emailsLoading);
  const setAccounts = useStore((s) => s.setAccounts);
  const setSelectedAccount = useStore((s) => s.setSelectedAccount);
  const setEmailsForAccount = useStore((s) => s.setEmailsForAccount);
  const setEmailsLoading = useStore((s) => s.setEmailsLoading);
  const setAccountSyncing = useStore((s) => s.setAccountSyncing);
  const setAccountRecategorizing = useStore((s) => s.setAccountRecategorizing);

  const emailsSyncing = useStore((s) =>
    isAccountSyncing(s, selectedAccount?.id)
  );
  const emailsRecategorizing = useStore((s) =>
    isAccountRecategorizing(s, selectedAccount?.id)
  );

  const refreshEmails = useCallback(
    async (accountId, { silent = false } = {}) => {
      if (!accountId) return;
      if (!silent) setEmailsLoading(true);
      try {
        const res = await api.get(`/emails/${accountId}`);
        setEmailsForAccount(accountId, withBodiesLoaded(res.data.emails || []));
      } catch {
        if (!silent && useStore.getState().selectedAccount?.id === accountId) {
          toast.error("Failed to load saved emails");
          setEmailsForAccount(accountId, []);
        }
      } finally {
        if (!silent) setEmailsLoading(false);
      }
    },
    [setEmailsForAccount, setEmailsLoading]
  );

  useEffect(() => {
    const load = async () => {
      setEmailsLoading(true);
      try {
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

        if (accounts.length) {
          const { data } = await api.get("/emails/all");
          for (const inbox of data.inboxes || []) {
            setEmailsForAccount(
              inbox.account_id,
              withBodiesLoaded(inbox.emails || [])
            );
          }
        }
      } catch {
        toast.error("Failed to load emails");
      } finally {
        setEmailsLoading(false);
      }
    };
    load();
  }, [setAccounts, setSelectedAccount, setEmailsForAccount, setEmailsLoading]);

  const syncEmails = useCallback(async () => {
    const account = useStore.getState().selectedAccount;
    if (!account) return;
    const accountId = account.id;
    if (
      isAccountSyncing(useStore.getState(), accountId) ||
      isAccountRecategorizing(useStore.getState(), accountId)
    ) {
      return;
    }

    setAccountSyncing(accountId, true);
    try {
      const { data: queued } = await api.post(`/emails/${accountId}/sync`);
      const job = await waitForJob(queued.job_id);
      await refreshEmails(accountId, { silent: true });
      const n = job.result?.new_count ?? 0;
      const total = job.result?.count ?? 0;
      toast.success(
        job.result?.incremental
          ? `Synced ${n} new email${n === 1 ? "" : "s"} (${total} in inbox)`
          : `Synced ${total} emails from the last 3 days`
      );
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      toast.error(
        typeof detail === "string"
          ? detail
          : "Failed to sync emails from Gmail"
      );
    } finally {
      setAccountSyncing(accountId, false);
    }
  }, [refreshEmails, setAccountSyncing]);

  const recategorizeAll = useCallback(async () => {
    const account = useStore.getState().selectedAccount;
    if (!account) return;
    const accountId = account.id;
    if (
      isAccountSyncing(useStore.getState(), accountId) ||
      isAccountRecategorizing(useStore.getState(), accountId)
    ) {
      return;
    }

    setAccountRecategorizing(accountId, true);
    try {
      const { data: queued } = await api.post(
        `/emails/${accountId}/recategorize`
      );
      const job = await waitForJob(queued.job_id);
      await refreshEmails(accountId, { silent: true });
      toast.success(`Re-categorized ${job.result?.count ?? 0} emails`);
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      toast.error(
        typeof detail === "string"
          ? detail
          : "Bulk re-categorization failed"
      );
    } finally {
      setAccountRecategorizing(accountId, false);
    }
  }, [refreshEmails, setAccountRecategorizing]);

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
