import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HorizontalPanelRail({
  children,
  className,
  contentClassName,
  stackOnMobile = false,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  stackOnMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        stackOnMobile
          ? "w-full overflow-x-visible overflow-y-visible md:overflow-x-auto md:overflow-y-hidden"
          : "w-full overflow-x-auto overflow-y-hidden",
        className,
      )}
    >
      <div
        className={cn(
          stackOnMobile
            ? "flex w-full min-w-0 flex-col justify-start md:w-max md:min-w-full md:flex-row md:justify-start"
            : "flex w-max min-w-full justify-start",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
