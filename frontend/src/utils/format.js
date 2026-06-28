export function getInitials(displayName, email) {
  const source = (displayName || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function formatEmailDate(dateStr) {
  if (!dateStr) return "";
  return dateStr.split(",")[0];
}
