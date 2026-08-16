import { useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios";
import useStore, {
  getSavedAccountId,
  isAccountRecategorizing,
  isAccountSyncing,
  isAnyAccountSyncing,
} from "../store/useStore";

const JOB_POLL_MS = 600;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const LIVE_REFRESH_MS = 800;

async function waitForJob(jobId, onProgress) {
  const started = Date.now();
  while (Date.now() - started < JOB_TIMEOUT_MS) {
    const { data } = await api.get(`/jobs/${jobId}`);
    if (data.result && typeof onProgress === "function") {
      // Do not await heavy work here — keep polling responsive
      onProgress(data.result, data.status);
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

  const runAccountSync = useCallback(
    async (account, { current = 1, total = 1 } = {}) => {
      const accountId = account.id;
      setSelectedAccount(account);
      setSyncProgress({
        current,
        total,
        email: account.email_address,
        phase: "starting",
        done: 0,
        jobTotal: 0,
        saved: 0,
      });
      setAccountSyncing(accountId, true);

      // Show this account's current inbox immediately (fixes blank 2nd/3rd accounts)
      await refreshEmails(accountId, { silent: true });

      let lastRefreshSaved = -1;
      let lastRefreshDone = -1;
      let lastRefreshAt = 0;
      let refreshInFlight = false;
      let pendingRefresh = false;

      const doRefresh = () => {
        if (refreshInFlight) {
          pendingRefresh = true;
          return;
        }
        refreshInFlight = true;
        refreshEmails(accountId, { silent: true })
          .catch(() => {})
          .finally(() => {
            refreshInFlight = false;
            if (pendingRefresh) {
              pendingRefresh = false;
              doRefresh();
            }
          });
      };

      const maybeLiveRefresh = (result) => {
        const phase = result?.phase;
        const saved = Number(result?.saved) || 0;
        const done = Number(result?.done) || 0;
        const now = Date.now();

        const progressMoved =
          saved > lastRefreshSaved || done > lastRefreshDone;
        const timeOk = now - lastRefreshAt >= LIVE_REFRESH_MS;

        const shouldRefresh =
          (phase === "fetching" && progressMoved && timeOk) ||
          (phase === "fetching" && saved > lastRefreshSaved) ||
          (phase === "categorizing" && timeOk) ||
          phase === "categorize_skipped";

        if (!shouldRefresh) return;

        lastRefreshSaved = Math.max(lastRefreshSaved, saved);
        lastRefreshDone = Math.max(lastRefreshDone, done);
        lastRefreshAt = now;
        doRefresh();
      };

      try {
        const { data: queued } = await api.post(`/emails/${accountId}/sync`);
        const job = await waitForJob(queued.job_id, (result) => {
          setSyncProgress({
            current,
            total,
            email: account.email_address,
            phase: result.phase || "fetching",
            done: result.done ?? 0,
            jobTotal: result.total ?? 0,
            saved: result.saved ?? 0,
          });
          maybeLiveRefresh(result);
        });
        await refreshEmails(accountId, { silent: true });
        return {
          ok: true,
          newCount: job.result?.new_count ?? 0,
          categorizeSkipped: job.result?.categorize_skipped ?? 0,
          job,
        };
      } catch (err) {
        const detail = err.response?.data?.detail || err.message;
        return {
          ok: false,
          error:
            typeof detail === "string"
              ? detail
              : `Failed to sync ${account.email_address}`,
        };
      } finally {
        setAccountSyncing(accountId, false);
      }
    },
    [
      refreshEmails,
      setAccountSyncing,
      setSelectedAccount,
      setSyncProgress,
    ]
  );

  /** Sync only the currently selected Gmail account. */
  const syncSelectedAccount = useCallback(async () => {
    const account = useStore.getState().selectedAccount;
    if (!account) {
      toast.error("Select a Gmail account first");
      return;
    }
    if (isAnyAccountSyncing(useStore.getState())) return;

    try {
      const result = await runAccountSync(account, { current: 1, total: 1 });
      if (result.ok) {
        toast.success(
          `Synced ${result.newCount} new email${result.newCount === 1 ? "" : "s"}`
        );
        if (result.categorizeSkipped > 0) {
          toast.error(
            `Emails fetched, but OpenRouter limit stopped categorizing (${result.categorizeSkipped} left uncategorized)`
          );
        }
      } else {
        toast.error(`${account.email_address}: ${result.error}`);
      }
    } finally {
      setSyncProgress(null);
    }
  }, [runAccountSync, setSyncProgress]);

  /** Sync a specific account (e.g. from sidebar). */
  const syncAccountById = useCallback(
    async (accountId) => {
      const account = (useStore.getState().accounts || []).find(
        (a) => a.id === accountId
      );
      if (!account) return;
      if (isAnyAccountSyncing(useStore.getState())) return;

      try {
        const result = await runAccountSync(account, { current: 1, total: 1 });
        if (result.ok) {
          toast.success(
            `Synced ${result.newCount} new email${result.newCount === 1 ? "" : "s"}`
          );
          if (result.categorizeSkipped > 0) {
            toast.error(
              `Emails fetched, but OpenRouter limit stopped categorizing (${result.categorizeSkipped} left uncategorized)`
            );
          }
        } else {
          toast.error(`${account.email_address}: ${result.error}`);
        }
      } finally {
        setSyncProgress(null);
      }
    },
    [runAccountSync, setSyncProgress]
  );

  /** Sync every Gmail account, one after another. */
  const syncAllAccounts = useCallback(async () => {
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
        const result = await runAccountSync(account, {
          current: i + 1,
          total: accounts.length,
        });
        if (result.ok) {
          synced += 1;
          newEmails += result.newCount;
          if (result.categorizeSkipped > 0) {
            toast.error(
              `${account.email_address}: emails fetched, but OpenRouter limit stopped categorizing (${result.categorizeSkipped} left uncategorized)`
            );
          }
        } else {
          failed += 1;
          toast.error(`${account.email_address}: ${result.error}`);
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
  }, [runAccountSync, setSyncProgress]);

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
    let lastRefreshAt = 0;
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
        const now = Date.now();
        if (now - lastRefreshAt >= LIVE_REFRESH_MS) {
          lastRefreshAt = now;
          refreshEmails(accountId, { silent: true }).catch(() => {});
        }
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
    syncSelectedAccount,
    syncAccountById,
    syncAllAccounts,
    /** @deprecated alias — prefer syncAllAccounts */
    syncEmails: syncAllAccounts,
    recategorizeAll,
  };
}
