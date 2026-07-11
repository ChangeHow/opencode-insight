export function OverviewEmptyState({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-start justify-center border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-6 py-8 text-left">
      <p className="metric-label">{kicker}</p>
      <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-3 max-w-xl text-xs leading-5 text-[var(--muted-foreground)]">
        {description}
      </p>
    </div>
  );
}
