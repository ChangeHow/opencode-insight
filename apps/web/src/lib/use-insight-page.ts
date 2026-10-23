import { useCallback, useEffect, useRef, useState } from "react";

type Page = { cursor?: string; previousCursor?: string; nextCursor?: string; reset?: boolean };
type PageState<T> = { key: string; cursor?: string; page?: T; loading: boolean; error?: string };

/** Keep one anchored page and coalesce refreshes without overlapping requests. */
export function useInsightPage<T extends Page>(
  key: string,
  enabled: boolean,
  load: (cursor?: string) => Promise<T>,
  revision?: number,
) {
  const [state, setState] = useState<PageState<T>>({ key, loading: false });
  const retained = useRef(state);
  const inflight = useRef<{ key: string; request: Promise<void> } | undefined>(undefined);
  const latestRevision = useRef(revision);
  latestRevision.current = revision;
  const controller = useRef<
    | {
        revision?: number;
        refresh: () => void;
        navigate: (cursor: string) => void;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    let disposed = false;
    let queued = false;
    let working = false;
    let current = retained.current.key === key ? retained.current : { key, loading: false };
    const publish = (next: PageState<T>) => {
      current = next;
      retained.current = next;
      setState(next);
    };
    const visible = () => !disposed && !document.hidden && enabled;
    async function drain() {
      if (working || !visible()) return;
      working = true;
      try {
        while (queued && visible()) {
          if (inflight.current?.key === key) await inflight.current.request;
          if (!visible()) break;
          queued = false;
          publish({ ...current, loading: true, error: undefined });
          const requestedCursor = current.cursor;
          const request = (async () => {
            try {
              const page = await load(requestedCursor);
              if (!visible() || current.cursor !== requestedCursor) return;
              if (page.reset && current.cursor !== undefined) {
                current = { ...current, cursor: undefined };
                queued = true;
              } else {
                publish({ key, cursor: page.cursor ?? current.cursor, page, loading: false });
              }
            } catch (error) {
              if (visible() && current.cursor === requestedCursor)
                publish({
                  ...current,
                  loading: false,
                  error: error instanceof Error ? error.message : "Insight details unavailable.",
                });
            }
          })();
          inflight.current = { key, request };
          await request;
          if (inflight.current?.request === request) inflight.current = undefined;
        }
      } finally {
        working = false;
      }
    }
    const refresh = () => {
      queued = true;
      void drain();
    };
    const active = {
      revision: latestRevision.current,
      refresh,
      navigate: (cursor: string) => {
        current = { ...current, cursor, loading: true, error: undefined };
        refresh();
      },
    };
    controller.current = active;
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      disposed = true;
      if (controller.current === active) controller.current = undefined;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, enabled, load]);

  useEffect(() => {
    const active = controller.current;
    if (active && active.revision !== revision) {
      active.revision = revision;
      active.refresh();
    }
  }, [revision]);
  const retry = useCallback(() => controller.current?.refresh(), []);
  const current = state.key === key ? state : { key, loading: enabled };
  return {
    ...current,
    retry,
    previous: () => {
      if (current.page?.previousCursor) controller.current?.navigate(current.page.previousCursor);
    },
    next: () => {
      if (current.page?.nextCursor) controller.current?.navigate(current.page.nextCursor);
    },
  };
}
