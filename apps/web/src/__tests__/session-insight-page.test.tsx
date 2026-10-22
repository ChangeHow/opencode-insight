import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useInsightPage } from "../lib/use-insight-page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("lazy insight detail pages", () => {
  test("loads only on disclosure and retains only the selected bounded page", async () => {
    const first = {
      entries: Array.from({ length: 50 }, (_, i) => i),
      total: 100000,
      nextCursor: "next",
    };
    const second = { entries: [50], total: 100000, previousCursor: "previous" };
    const load = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValue(first);
    const { result, rerender } = renderHook(
      ({ open }) => useInsightPage("session:current", open, load),
      { initialProps: { open: false } },
    );
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    rerender({ open: true });
    await act(async () => {});
    expect(load).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(result.current.page).toEqual(first);
    await act(async () => {
      result.current.next();
    });
    expect(load).toHaveBeenLastCalledWith("next");
    expect(result.current.page).toEqual(second);
    await act(async () => {
      result.current.previous();
    });
    expect(load).toHaveBeenLastCalledWith("previous");
    expect(result.current.page?.entries).toHaveLength(50);
    expect(load).toHaveBeenCalledTimes(3);
  });

  test("refreshes an expanded anchored page on a new revision, not unchanged polls", async () => {
    const first = { entries: ["tool-a", "tool-b"], cursor: "anchor", start: 0, end: 2, total: 2 };
    const load = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockImplementation(async (cursor?: string) => ({
        ...first,
        total: 3,
        entries: cursor === "anchor" ? first.entries : ["tool-b", "appended"],
      }));
    const { result, rerender } = renderHook(
      ({ revision, open }) => useInsightPage("session:tools", open, load, revision),
      { initialProps: { revision: 1, open: false } },
    );
    rerender({ revision: 2, open: false });
    expect(load).not.toHaveBeenCalled();
    rerender({ revision: 2, open: true });
    await act(async () => {});
    expect(load).toHaveBeenCalledExactlyOnceWith(undefined);
    rerender({ revision: 3, open: true });
    await act(async () => {});
    expect(load).toHaveBeenLastCalledWith("anchor");
    expect(result.current.page?.entries).toEqual(["tool-a", "tool-b"]);
    expect(result.current.page?.total).toBe(3);
    rerender({ revision: 3, open: true });
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.cursor).toBe("anchor");
  });

  test("keeps the previous page after a refresh failure and retries its anchor", async () => {
    const page = { entries: ["retained"], cursor: "anchor" };
    const load = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue({ ...page, entries: ["updated"] });
    const { result, rerender } = renderHook(
      ({ revision }) => useInsightPage("session", true, load, revision),
      { initialProps: { revision: 1 } },
    );
    await act(async () => {});
    rerender({ revision: 2 });
    await act(async () => {});
    expect(result.current.page).toBe(page);
    expect(result.current.error).toBe("Unavailable");
    await act(async () => {
      result.current.retry();
    });
    expect(load).toHaveBeenLastCalledWith("anchor");
    expect(result.current.page?.entries).toEqual(["updated"]);
    expect(result.current.error).toBeUndefined();
  });

  test("coalesces revision changes during in-flight work into one anchored refresh", async () => {
    const page = { entries: ["tool"], cursor: "anchor" };
    let resolve!: (value: typeof page) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(page);
    const { result, rerender } = renderHook(
      ({ revision }) => useInsightPage("session", true, load, revision),
      { initialProps: { revision: 1 } },
    );
    for (let revision = 2; revision <= 10; revision++) rerender({ revision });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(page);
    });
    expect(load.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, "anchor"]);
    expect(result.current.page).toBe(page);
  });

  test("returns to the first page when a cursor is reset by the server", async () => {
    const first = { entries: ["first"], nextCursor: "old-cursor", reset: false };
    const load = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({ entries: [], reset: true })
      .mockResolvedValue({ entries: ["new first"], reset: false });
    const { result } = renderHook(() => useInsightPage("session", true, load));
    await act(async () => {});
    await act(async () => {
      result.current.next();
    });
    expect(load.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, "old-cursor", undefined]);
    expect(result.current.page?.entries).toEqual(["new first"]);
    expect(result.current.loading).toBe(false);
  });

  test("discards pending session, scope and kind results and resets their cursors", async () => {
    type Page = { entries: string[]; nextCursor?: string };
    let resolve!: (page: Page) => void;
    const load = vi
      .fn()
      .mockResolvedValueOnce({ entries: ["old"], nextCursor: "old-cursor" })
      .mockImplementationOnce(
        () =>
          new Promise<Page>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue({ entries: ["new"] });
    const { result, rerender } = renderHook(({ key }) => useInsightPage(key, true, load), {
      initialProps: { key: "first:current:tool" },
    });
    await act(async () => {});
    await act(async () => {
      result.current.next();
    });
    expect(load).toHaveBeenLastCalledWith("old-cursor");
    rerender({ key: "second:cumulative:skill" });
    await act(async () => {});
    expect(load).toHaveBeenLastCalledWith(undefined);
    expect(result.current.page?.entries).toEqual(["new"]);
    await act(async () => {
      resolve({ entries: ["stale"] });
    });
    expect(result.current.page?.entries).toEqual(["new"]);
  });

  test("does not publish hidden refresh results and resumes on the retained anchor", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const page = { entries: ["retained"], cursor: "anchor" };
    let resolve!: (value: typeof page) => void;
    const load = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue({ ...page, entries: ["visible update"] });
    const { result, rerender } = renderHook(
      ({ revision }) => useInsightPage("session", true, load, revision),
      { initialProps: { revision: 1 } },
    );
    await act(async () => {});
    rerender({ revision: 2 });
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      resolve({ ...page, entries: ["hidden stale update"] });
    });
    expect(result.current.page).toBe(page);
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(load).toHaveBeenLastCalledWith("anchor");
    expect(result.current.page?.entries).toEqual(["visible update"]);
  });

  test("pauses hidden disclosures, retries errors and avoids overlapping visibility requests", async () => {
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let resolve!: (page: { entries: string[]; nextCursor?: string }) => void;
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
    const { result, unmount } = renderHook(() => useInsightPage("session", true, load));
    await act(async () => {});
    expect(load).not.toHaveBeenCalled();
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.error).toBe("Unavailable");
    await act(async () => {
      result.current.retry();
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(load).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      resolve({ entries: ["ignored"] });
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
