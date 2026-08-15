/** Human-readable live sync / categorize status for the inbox header. */
export function formatSyncStatus(syncProgress, { recategorizing = false } = {}) {
  if (!syncProgress && !recategorizing) return null;

  const phase = syncProgress?.phase;
  const done = Number(syncProgress?.done) || 0;
  const jobTotal = Number(syncProgress?.jobTotal) || 0;
  const accountPart =
    syncProgress?.total > 1
      ? `${syncProgress.current}/${syncProgress.total} · `
      : "";

  if (phase === "fetching" && jobTotal > 0) {
    return `${accountPart}Fetched ${done}/${jobTotal}`;
  }
  if (phase === "categorizing" && jobTotal > 0) {
    return `${accountPart}Categorizing ${done}/${jobTotal}`;
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
  if (recategorizing || syncProgress?.mode === "recategorize") {
    return jobTotal > 0
      ? `Categorizing ${done}/${jobTotal}`
      : "Re-categorizing…";
  }
  if (syncProgress?.total > 1) {
    return `Syncing ${syncProgress.current}/${syncProgress.total}…`;
  }
  return "Syncing…";
}
