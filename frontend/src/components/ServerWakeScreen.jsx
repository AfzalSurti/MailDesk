export default function ServerWakeScreen() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139, 115, 85, 0.15), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-md w-full">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent mb-8">
          MailDesk
        </p>

        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-accent/10 blur-2xl scale-150" />
          <div className="relative w-28 h-28 rounded-full bg-card border border-border shadow-sm flex items-center justify-center p-4">
            <img
              src="/geo-logo.png"
              alt="Geo Designs & Research"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="absolute inset-0 rounded-full border border-accent/20 animate-ping scale-110 opacity-30" />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-ink leading-tight mb-3">
          Geo Designs &amp; Research Pvt. Ltd.
        </h1>

        <p className="text-sm text-muted leading-relaxed mb-10 max-w-sm">
          Waking up server — this can take up to a minute on first load while
          our cloud backend starts.
        </p>

        <div className="flex items-center gap-2 text-sm text-accent font-medium">
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
          </span>
          Connecting
        </div>
      </div>
    </div>
  );
}
