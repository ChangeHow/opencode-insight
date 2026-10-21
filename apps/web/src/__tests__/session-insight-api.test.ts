import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, fetchSession, fetchSessionInsight } from "../lib/api";

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
