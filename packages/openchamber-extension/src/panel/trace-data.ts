import type { ToolInsight } from "@opencode-insight/telemetry/schema";
import type {
  OverviewResponse,
  ToolPage,
  ToolPageInput,
} from "@opencode-insight/telemetry/queries";

export type ToolPageReader = (input: Omit<ToolPageInput, "sessionID">) => Promise<ToolPage>;

/** Retain only the visible call page and one selected tool, never the session snapshot. */
export function createTraceData(read: ToolPageReader, changed: () => void) {
  let target = "";
  let revision = -1;
  let epoch = 0;
  let detailEpoch = 0;
  let disposed = false;
  let group: string | undefined;
  let cursor: string | undefined;
  let page: ToolPage | undefined;
  let pageIndex = 0;
  let requestedIndex = 0;
  let detail: ToolInsight | undefined;
  let selectedID: string | undefined;
  let busy = false;
  let detailBusy = false;
  let reloadDetail = false;
  let reload = false;
  let error: string | undefined;
  async function loadPage() {
    if (disposed || group === undefined) return;
    if (busy) {
      reload = true;
      return;
    }
    busy = true;
    const run = epoch;
    const input = { group, cursor, limit: 20 };
    changed();
    try {
      const result = await read(input);
      if (disposed || run !== epoch) return;
      if (result.reset && input.cursor) {
        cursor = undefined;
        pageIndex = 0;
        requestedIndex = 0;
        page = undefined;
        reload = true;
      } else {
        page = result;
        pageIndex = requestedIndex;
        cursor = result.cursor;
        if (selectedID) detail = result.entries.find((tool) => tool.id === selectedID) ?? detail;
        error = undefined;
      }
    } catch (cause) {
      if (!disposed && run === epoch)
        error = cause instanceof Error ? cause.message : "Tool details unavailable.";
    } finally {
      busy = false;
      if (!disposed) {
        changed();
        if (reload) {
          reload = false;
          void loadPage();
        }
      }
    }
  }
  async function loadDetail(id: string) {
    if (detailBusy) {
      reloadDetail = true;
      return;
    }
    detailBusy = true;
    const run = ++detailEpoch;
    try {
      const result = await read({ toolID: id });
      if (disposed || run !== detailEpoch || selectedID !== id) return;
      detail = result.entries.find((tool) => tool.id === id);
      error = undefined;
    } catch (cause) {
      if (!disposed && run === detailEpoch)
        error = cause instanceof Error ? cause.message : "Tool details unavailable.";
    } finally {
      detailBusy = false;
      if (!disposed && reloadDetail) {
        reloadDetail = false;
        if (selectedID) void loadDetail(selectedID);
      }
    }
    if (!disposed && run === detailEpoch) changed();
  }
  function reset() {
    epoch++;
    detailEpoch++;
    target = "";
    revision = -1;
    group = cursor = selectedID = undefined;
    page = detail = undefined;
    pageIndex = requestedIndex = 0;
    reload = reloadDetail = false;
    error = undefined;
  }
  return {
    get state() {
      return { page, pageIndex, detail, busy, error };
    },
    update(overview: OverviewResponse) {
      const key = `${overview.directory}\0${overview.sessionID}`;
      if (key !== target) {
        reset();
        target = key;
      }
      if (revision === overview.revision) return;
      const previous = revision;
      revision = overview.revision;
      if (previous < 0) return;
      if (group !== undefined) void loadPage();
      if (selectedID && !page?.entries.some((tool) => tool.id === selectedID))
        void loadDetail(selectedID);
    },
    open(name: string) {
      epoch++;
      group = name;
      cursor = undefined;
      page = undefined;
      pageIndex = requestedIndex = 0;
      error = undefined;
      void loadPage();
    },
    move(next: number) {
      const value = next > pageIndex ? page?.nextCursor : page?.previousCursor;
      if (!value || busy) return;
      epoch++;
      cursor = value;
      requestedIndex = next;
      void loadPage();
    },
    select(id: string) {
      selectedID = id;
      detailEpoch++;
      detail = page?.entries.find((tool) => tool.id === id);
      if (!detail) void loadDetail(id);
    },
    clearSelection() {
      selectedID = undefined;
      detail = undefined;
      detailEpoch++;
      reloadDetail = false;
    },
    close() {
      epoch++;
      group = cursor = undefined;
      page = undefined;
      pageIndex = requestedIndex = 0;
      reload = false;
    },
    retry() {
      error = undefined;
      if (group !== undefined) void loadPage();
      if (selectedID && !page?.entries.some((tool) => tool.id === selectedID))
        void loadDetail(selectedID);
    },
    reset,
    dispose() {
      reset();
      disposed = true;
    },
  };
}
