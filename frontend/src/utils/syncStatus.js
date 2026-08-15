/** Human-readable live sync / categorize status for the inbox header. */
export function formatSyncStatus(syncProgress, { recategorizing = false } = {}) {
  if (!syncProgress && !recategorizing) return null;

  const phase = syncProgress?.phase;
  const done = Number(syncProgress?.done) || 0;
  const jobTotal = Number(syncProgress?.jobTotal) || 0;
  const saved = Number(syncProgress?.saved) || 0;
  const accountPart =
    syncProgress?.total > 1
      ? `Account ${syncProgress.current}/${syncProgress.total} · `
      : "";

  if (phase === "fetching") {
    if (jobTotal > 0) {
      // Prefer saved count when available — that's what's already in the inbox
      const shown = saved > 0 ? saved : done;
      return `${accountPart}Fetched ${shown}/${jobTotal}`;
    }
    return `${accountPart}Fetching…`;
  }
  if (phase === "categorizing") {
    return jobTotal > 0
      ? `${accountPart}Categorizing ${done}/${jobTotal}`
      : `${accountPart}Categorizing…`;
  }
  if (phase === "matching_replies") {
    return `${accountPart}Matching replies…`;
  }
  if (phase === "pruning") {
    return `${accountPart}Cleaning old mail…`;
  }
  if (phase === "indexing") {
    return `${accountPart}Indexing…`;
  }
  if (phase === "starting") {
    return `${accountPart}Starting…`;
  }
  if (recategorizing || syncProgress?.mode === "recategorize") {
    return jobTotal > 0
      ? `Categorizing ${done}/${jobTotal}`
      : "Re-categorizing…";
  }
  if (syncProgress?.total > 1) {
    return `Account ${syncProgress.current}/${syncProgress.total}…`;
  }
  return "Syncing…";
}
