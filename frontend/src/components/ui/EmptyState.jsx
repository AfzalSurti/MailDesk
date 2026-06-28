export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "p-4" : "p-6"
      } max-w-xs mx-auto`}
    >
      {Icon && (
        <Icon
          className={`${compact ? "w-8 h-8 mb-3" : "w-10 h-10 mb-4"} text-muted/30`}
        />
      )}
      <p className={`${compact ? "text-xs" : "text-sm"} font-medium text-ink`}>
        {title}
      </p>
      {description && (
        <p className="text-xs text-muted mt-1.5 leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-primary mt-4">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
