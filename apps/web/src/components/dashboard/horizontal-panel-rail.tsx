import { useCallback, useEffect, useRef } from "react";
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const interactedRef = useRef(false);

  const centerScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollLeft = maxScrollLeft > 0 ? maxScrollLeft / 2 : 0;
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const content = viewport.firstElementChild;
    const frame = requestAnimationFrame(centerScroll);
    const observer = new ResizeObserver(() => {
      if (!interactedRef.current) {
        requestAnimationFrame(centerScroll);
      }
    });

    observer.observe(viewport);
    if (content) {
      observer.observe(content);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [centerScroll]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        stackOnMobile
          ? "w-full overflow-x-visible overflow-y-visible md:overflow-x-auto md:overflow-y-hidden"
          : "w-full overflow-x-auto overflow-y-hidden",
        className,
      )}
      onPointerDown={() => {
        interactedRef.current = true;
      }}
      onWheel={() => {
        interactedRef.current = true;
      }}
    >
      <div
        className={cn(
          stackOnMobile
            ? "flex w-full min-w-0 flex-col justify-start md:w-max md:min-w-full md:flex-row md:justify-center"
            : "flex w-max min-w-full justify-center",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
