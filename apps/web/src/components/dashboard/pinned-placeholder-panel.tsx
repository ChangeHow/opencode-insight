export function PinnedPlaceholderPanel({
  eyebrow = "Placeholder",
  title = "More panels",
  description = "Reserved for additional pinned breakdowns and future provider-level callouts.",
  status = "Coming soon",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  status?: string;
}) {
  return (
    <div className="flex h-full w-[16rem] min-w-[16rem] shrink-0 flex-col rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/72 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">{eyebrow}</p>
          <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{status}</p>
      </div>
    </div>
  );
}
