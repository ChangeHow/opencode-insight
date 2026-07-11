import type {
  MessageAnalyticsPayload,
  MessageDetail,
  MessageListPayload,
} from "@opencode-dashboard/shared";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  messageAnalyticsErrorAtom,
  messageOverviewAtom,
  messagesAtom,
  messagesLoadingAtom,
  messagesPageAtom,
  messageSessionCache,
  messagesTotalAtom,
  setMessageSessionCache,
} from "../lib/atoms";

vi.mock("../lib/api.js", () => ({
  fetchMessageAnalytics: vi.fn(),
  fetchMessages: vi.fn(),
}));

import { MessageAnalyticsPanel } from "../components/dashboard/message-analytics-panel";
import { fetchMessageAnalytics, fetchMessages } from "../lib/api";

const mockFetchMessageAnalytics = vi.mocked(fetchMessageAnalytics);
const mockFetchMessages = vi.mocked(fetchMessages);

function makeAnalytics(totalMessages: number): MessageAnalyticsPayload {
  return {
    overview: { timeline: [], toolUsage: [], totalMessages },
    distribution: { points: [], totalMessages },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const staleMessage: MessageDetail = {
  id: "message-from-old-session",
  role: "user",
  createdAt: 1,
  cost: 0,
  tokens: { input: 1, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  parts: [],
};

describe("MessageAnalyticsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageSessionCache.clear();
    mockFetchMessageAnalytics.mockResolvedValue(makeAnalytics(0));
    mockFetchMessages.mockResolvedValue({ messages: [], total: 0, page: 0, pageSize: 50 });
  });

  test("resets message list state when switching to a session with cached analytics", async () => {
    const store = createStore();
    const firstAnalytics = makeAnalytics(1);
    const secondAnalytics = makeAnalytics(2);
    setMessageSessionCache("session-a", firstAnalytics.overview, firstAnalytics.distribution);
    setMessageSessionCache("session-b", secondAnalytics.overview, secondAnalytics.distribution);

    const { rerender } = render(
      <Provider store={store}>
        <MessageAnalyticsPanel sessionId="session-a" />
      </Provider>,
    );

    await waitFor(() => expect(store.get(messageOverviewAtom)?.totalMessages).toBe(1));
    act(() => {
      store.set(messagesAtom, [staleMessage]);
      store.set(messagesTotalAtom, 1);
      store.set(messagesPageAtom, 3);
      store.set(messagesLoadingAtom, true);
      store.set(messageAnalyticsErrorAtom, "Previous session failed.");
    });

    rerender(
      <Provider store={store}>
        <MessageAnalyticsPanel sessionId="session-b" />
      </Provider>,
    );

    await waitFor(() => expect(store.get(messageOverviewAtom)?.totalMessages).toBe(2));
    expect(store.get(messagesAtom)).toEqual([]);
    expect(store.get(messagesTotalAtom)).toBe(0);
    expect(store.get(messagesPageAtom)).toBe(0);
    expect(store.get(messagesLoadingAtom)).toBe(false);
    expect(store.get(messageAnalyticsErrorAtom)).toBeNull();
  });

  test("ignores message results that resolve after the session changes", async () => {
    const store = createStore();
    const oldRequest = deferred<MessageListPayload>();
    const firstAnalytics = makeAnalytics(1);
    const secondAnalytics = makeAnalytics(2);
    setMessageSessionCache("session-a", firstAnalytics.overview, firstAnalytics.distribution);
    setMessageSessionCache("session-b", secondAnalytics.overview, secondAnalytics.distribution);
    mockFetchMessages.mockReturnValueOnce(oldRequest.promise);

    const { rerender } = render(
      <Provider store={store}>
        <MessageAnalyticsPanel sessionId="session-a" />
      </Provider>,
    );

    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalledWith("session-a", 0));

    rerender(
      <Provider store={store}>
        <MessageAnalyticsPanel sessionId="session-b" />
      </Provider>,
    );
    await waitFor(() => expect(store.get(messageOverviewAtom)?.totalMessages).toBe(2));

    await act(async () => {
      oldRequest.resolve({ messages: [staleMessage], total: 1, page: 0, pageSize: 50 });
      await oldRequest.promise;
    });

    expect(store.get(messagesAtom)).toEqual([]);
    expect(store.get(messagesTotalAtom)).toBe(0);
    expect(store.get(messagesLoadingAtom)).toBe(false);
  });

  test("shows analytics failures instead of leaving a loading placeholder", async () => {
    const user = userEvent.setup();
    mockFetchMessageAnalytics.mockRejectedValueOnce(new Error("Analytics service unavailable."));

    render(
      <Provider store={createStore()}>
        <MessageAnalyticsPanel sessionId="session-a" />
      </Provider>,
    );

    await user.click(screen.getByRole("tab", { name: "Metrics" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load message analytics.");
    expect(alert).toHaveTextContent("Analytics service unavailable.");
  });
});
