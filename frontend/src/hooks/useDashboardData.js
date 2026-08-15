import { useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, {
  getSavedAccountId,
  isAccountRecategorizing,
  isAccountSyncing,
  isAnyAccountSyncing,
} from "../store/useStore";

const JOB_POLL_MS = 800;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;

async function waitForJob(jobId, onProgress) {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const { data } = await api.get(`/jobs/${jobId}`);
    if (data.result && typeof onProgress === "function") {
      onProgress(data.result);
    }
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

  const emailsSyncing = useStore((s) => isAnyAccountSyncing(s));
  const emailsRecategorizing = useStore((s) =>
    isAccountRecategorizing(s, selectedAccount?.id)
  );
  const syncProgress = useStore((s) => s.syncProgress);
  const setSyncProgress = useStore((s) => s.setSyncProgress);

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
    const accounts = useStore.getState().accounts || [];
    if (!accounts.length) {
      toast.error("Add a Gmail account first");
      return;
    }
    if (isAnyAccountSyncing(useStore.getState())) return;

    let synced = 0;
    let failed = 0;
    let newEmails = 0;

    try {
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const accountId = account.id;
        setSyncProgress({
          current: i + 1,
          total: accounts.length,
          email: account.email_address,
          phase: "starting",
          done: 0,
          jobTotal: 0,
        });
        setAccountSyncing(accountId, true);
        try {
          const { data: queued } = await api.post(`/emails/${accountId}/sync`);
          const job = await waitForJob(queued.job_id, (result) => {
            setSyncProgress({
              current: i + 1,
              total: accounts.length,
              email: account.email_address,
              phase: result.phase || "fetching",
              done: result.done ?? 0,
              jobTotal: result.total ?? 0,
              saved: result.saved,
            });
          });
          await refreshEmails(accountId, { silent: true });
          synced += 1;
          newEmails += job.result?.new_count ?? 0;
        } catch (err) {
          failed += 1;
          const detail = err.response?.data?.detail || err.message;
          toast.error(
            typeof detail === "string"
              ? `${account.email_address}: ${detail}`
              : `Failed to sync ${account.email_address}`
          );
        } finally {
          setAccountSyncing(accountId, false);
        }
      }

      if (failed === 0) {
        toast.success(
          accounts.length === 1
            ? `Synced ${newEmails} new email${newEmails === 1 ? "" : "s"}`
            : `Synced all ${synced} accounts (${newEmails} new emails)`
        );
      } else if (synced > 0) {
        toast.success(
          `Synced ${synced}/${accounts.length} accounts (${failed} failed)`
        );
      }
    } finally {
      setSyncProgress(null);
    }
  }, [refreshEmails, setAccountSyncing, setSyncProgress]);

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
    setSyncProgress({
      current: 1,
      total: 1,
      email: account.email_address,
      phase: "categorizing",
      done: 0,
      jobTotal: 0,
      mode: "recategorize",
    });
    try {
      const { data: queued } = await api.post(
        `/emails/${accountId}/recategorize`
      );
      const job = await waitForJob(queued.job_id, (result) => {
        setSyncProgress({
          current: 1,
          total: 1,
          email: account.email_address,
          phase: result.phase || "categorizing",
          done: result.done ?? 0,
          jobTotal: result.total ?? 0,
          mode: "recategorize",
        });
      });
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
      setSyncProgress(null);
    }
  }, [refreshEmails, setAccountRecategorizing, setSyncProgress]);

  return {
    selectedAccount,
    emails,
    emailsLoading,
    emailsSyncing,
    emailsRecategorizing,
    syncProgress,
    syncEmails,
    recategorizeAll,
  };
}
