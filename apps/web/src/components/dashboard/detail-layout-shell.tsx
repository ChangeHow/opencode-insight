import type { ReactNode } from "react";
import { useAtom, useAtomValue } from "jotai";
import { customDateRangeAtom, detailLoadingAtom, errorAtom, themeAtom } from "@/lib/atoms";
import { canRefreshDetailDate } from "@/lib/date-range";
import { DashboardPageLayout, DetailStickyHeader } from "@/routes/dashboard/layout";

export function DetailLayoutShell({
  backTo,
  backParams,
  backLabel,
  title,
  date,
  onRefresh,
  children,
}: {
  backTo: "/overview" | "/detail/$date";
  backParams?: { date: string };
  backLabel: string;
  title: string;
  date: string;
  onRefresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [theme, setTheme] = useAtom(themeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const error = useAtomValue(errorAtom);
  const loading = useAtomValue(detailLoadingAtom);
  const canRefresh = canRefreshDetailDate(date, customDateRange.end);

  return (
    <DashboardPageLayout
      variant="wide"
      header={
        <DetailStickyHeader
          backTo={backTo}
          backParams={backParams}
          backLabel={backLabel}
          title={title}
          theme={theme}
          onThemeChange={setTheme}
          canRefresh={canRefresh}
          onRefresh={onRefresh}
        />
      }
    >
      <div className="px-6 sm:px-8 lg:px-10">
        {error && !loading ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
      {children}
    </DashboardPageLayout>
  );
}
