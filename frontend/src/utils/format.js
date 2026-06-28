export function getInitials(displayName, email) {
  const source = (displayName || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function formatSender(fromAddress) {
  if (!fromAddress) return "Unknown sender";
  const match = fromAddress.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  if (fromAddress.includes("@")) return fromAddress.split("@")[0];
  return fromAddress;
}

export function formatEmailDate(dateStr) {
  if (!dateStr) return "";
  try {
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) {
      return dateStr.split(",")[0].trim();
    }
    const now = new Date();
    const sameDay =
      parsed.getDate() === now.getDate() &&
      parsed.getMonth() === now.getMonth() &&
      parsed.getFullYear() === now.getFullYear();
    if (sameDay) {
      return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return parsed.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return dateStr.split(",")[0].trim();
  }
}
