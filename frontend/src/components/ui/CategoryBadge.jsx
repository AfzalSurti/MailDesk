import { PRIORITY_COLORS } from "../../constants/categories";

export default function CategoryBadge({ name, priority, confidence, compact = false }) {
  if (!name) return null;

  const colorClass = PRIORITY_COLORS[priority] || PRIORITY_COLORS.low;
  const confidenceLabel =
    confidence != null ? `${Math.round(confidence * 100)}%` : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold uppercase tracking-wide ${colorClass} ${
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"
      }`}
    >
      {name}
      {confidenceLabel && !compact && (
        <span className="opacity-70 font-normal normal-case">{confidenceLabel}</span>
      )}
    </span>
  );
}
