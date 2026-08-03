import { useEffect, useCallback, useRef } from "react";
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
        attachments: prev.attachments,
        bodyLoaded: true,
      };
    }
    return { ...row, bodyLoaded: false };
  });
}

export function useDashboardData() {
  const selectedAccount = useStore((s) => s.selectedAccount);
  const emails = useStore((s) => s.emails);
  const emailsLoading = useStore((s) => s.emailsLoading);
  const setAccounts = useStore((s) => s.setAccounts);
  const setSelectedAccount = useStore((s) => s.setSelectedAccount);
  const setEmailsForAccount = useStore((s) => s.setEmailsForAccount);
  const setEmailsLoading = useStore((s) => s.setEmailsLoading);
  const setSelectedEmailId = useStore((s) => s.setSelectedEmailId);
  const setAccountSyncing = useStore((s) => s.setAccountSyncing);
  const setAccountRecategorizing = useStore((s) => s.setAccountRecategorizing);
  const emailsByAccount = useStore((s) => s.emailsByAccount);

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
        const prev = useStore.getState().emailsByAccount[accountId] || [];
        // Never write another account's response into the wrong inbox
        if (useStore.getState().selectedAccount?.id !== accountId) {
          setEmailsForAccount(
            accountId,
            mergeEmailList(prev, res.data.emails || [])
          );
          return;
        }
        setEmailsForAccount(
          accountId,
          mergeEmailList(prev, res.data.emails || [])
        );
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

  // Clicking a mail ID loads that account's inbox only (no re-categorize)
  useEffect(() => {
    if (!selectedAccount) {
      return;
    }
    setSelectedEmailId(null);
    const cached = emailsByAccount[selectedAccount.id];
    if (cached?.length) {
      // show cache instantly, refresh quietly
      refreshEmails(selectedAccount.id, { silent: true });
    } else {
      refreshEmails(selectedAccount.id);
    }
  }, [selectedAccount?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
