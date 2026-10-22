import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApiError,
  fetchSession,
  fetchSessionInsight,
  fetchSessionInsightOverview,
  fetchSessionInsightSeriesWindow,
  fetchSessionInsightSources,
  fetchSessionInsightTools,
} from "../lib/api";

afterEach(() => vi.unstubAllGlobals());
describe("session insight API", () => {
  test("encodes the ID and forwards an optional revision", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    await fetchSessionInsight("ses_one");
    await fetchSessionInsight("ses_one", 0);
    await fetchSessionInsight("ses_unsafe/path", 12);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/session/ses_one/insight",
      "/api/session/ses_one/insight?after=0",
      "/api/session/ses_unsafe%2Fpath/insight?after=12",
    ]);
  });
  test("uses bounded purpose-specific queries and encodes pagination filters", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    await fetchSessionInsightOverview("ses_unsafe/path");
    await fetchSessionInsightOverview("ses_one", 0);
    await fetchSessionInsightSeriesWindow("ses_unsafe/path");
    await fetchSessionInsightSources("ses_one", "cumulative", { kind: "tool", cursor: "next/+" });
    await fetchSessionInsightTools("ses_one", { group: "shell/path", cursor: "next/+" });
    await fetchSessionInsightTools("ses_one", { toolID: "tool/one" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/session/ses_unsafe%2Fpath/insight/overview",
      "/api/session/ses_one/insight/overview?after=0",
      "/api/session/ses_unsafe%2Fpath/insight/series-window",
      "/api/session/ses_one/insight/sources?scope=cumulative&limit=50&kind=tool&cursor=next%2F%2B",
      "/api/session/ses_one/insight/tools?limit=20&group=shell%2Fpath&cursor=next%2F%2B",
      "/api/session/ses_one/insight/tools?limit=20&toolID=tool%2Fone",
    ]);
  });
  test("preserves HTTP status so V2 sessions do not require legacy usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "No session found." }),
      }),
    );
    await expect(fetchSession("ses_missing")).rejects.toMatchObject({
      status: 404,
      message: "No session found.",
    });
    await expect(fetchSessionInsight("ses_missing")).rejects.toBeInstanceOf(ApiError);
  });
});
