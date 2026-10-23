// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  RequestInsight,
  SessionInsight,
  ToolInsight,
} from "@opencode-insight/telemetry/schema";
import { buildOverview, buildToolPage } from "@opencode-insight/telemetry/queries";
import { createTraceView } from "./trace-view";
import { stubPopover } from "./popover.test-helper";

stubPopover();

const request = (overrides: Partial<RequestInsight> = {}): RequestInsight => ({
  id: "request",
  model: "model",
  startedAt: 0,
  endedAt: 10000,
  status: "completed",
  reasoningMode: "unknown",
  buckets: [],
  context: [],
  capture: "live",
  ...overrides,
});
const tool = (overrides: Partial<ToolInsight> = {}): ToolInsight => ({
  id: "tool",
  name: "bash",
  requestID: "request",
  startedAt: 100,
  endedAt: 200,
  status: "completed",
  background: false,
  ...overrides,
});
const session = (
  requests: RequestInsight[] = [request()],
  tools: ToolInsight[] = [tool()],
): SessionInsight => ({
  version: 1,
  sessionID: "session",
  directory: "/local",
  revision: 1,
  updatedAt: 10000,
  interruptedCapture: false,
  requests,
  tools,
});
const mounted: Array<{ root: HTMLElement; view: { dispose(): void } }> = [];
function mount(input = session(), now = 10000) {
  const root = document.createElement("main");
  document.body.append(root);
  let raw = input;
  const readTools = vi.fn(async (query: Parameters<import("./trace-data").ToolPageReader>[0]) =>
    buildToolPage(raw, { ...query, sessionID: raw.sessionID }),
  );
  const trace = createTraceView(root, readTools);
  const view = {
    ...trace,
    async update(next: SessionInsight, clock = now) {
      raw = next;
      trace.update(buildOverview(raw, clock), clock);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
  mounted.push({ root, view });
  trace.update(buildOverview(input, now), now);
  return { root, view, readTools };
}
function button(root: ParentNode, label: string) {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => (node.getAttribute("aria-label") ?? node.textContent) === label,
  );
  expect(found, label).toBeDefined();
  return found!;
}
function row(root: ParentNode, key: string) {
  const found = [...root.querySelectorAll<HTMLElement>(".trace-row")].find(
    (node) => node.dataset.traceKey === key,
  );
  expect(found, key).toBeDefined();
  return found!;
}
const inspector = (root: ParentNode) => root.querySelector<HTMLElement>(".trace-inspector")!;
function field(root: ParentNode, label: string) {
  return [...root.querySelectorAll(".trace-fields > div")]
    .find((node) => node.querySelector("dt")?.textContent === label)
    ?.querySelector("dd")?.textContent;
}
const fold = (node: HTMLElement) => node.querySelector<HTMLButtonElement>(".trace-fold button")!;
const inspect = (node: HTMLElement) => node.querySelector<HTMLButtonElement>(".trace-name button")!;

describe("collapsible trace view", () => {
  afterEach(() => {
    for (const { root, view } of mounted.splice(0)) {
      view.dispose();
      root.remove();
    }
  });

  test("groups native tools across requests and preserves explicit request and parent metadata", async () => {
    const { root } = mount(
      session(
        [request(), request({ id: "other", model: "other-model" })],
        [
          tool(),
          tool({ id: "other-tool", requestID: "other", name: "read" }),
          tool({ id: "missing", requestID: undefined, parentID: "tool" }),
          tool({ id: "dangling", requestID: "absent" }),
        ],
      ),
    );
    expect(root.querySelectorAll('.trace-row[data-kind="request"]')).toHaveLength(0);
    expect(inspect(row(root, "group:bash")).textContent).toBe("bash ×3");
    expect(row(root, "tool:other-tool").style.getPropertyValue("--depth")).toBe("1");
    fold(row(root, "group:bash")).click();
    await Promise.resolve();
    expect(row(root, "tool:tool").style.getPropertyValue("--depth")).toBe("2");
    inspect(row(root, "tool:missing")).click();
    await Promise.resolve();
    expect(field(root, "Request ID")).toBe("Unassociated");
    expect(field(root, "Recorded parent call")).toBe("tool");
    inspect(row(root, "tool:dangling")).click();
    await Promise.resolve();
    expect(field(root, "Request ID")).toBe("absent");
    inspect(row(root, "tool:other-tool")).click();
    await Promise.resolve();
    expect(field(root, "Request ID")).toBe("other");
  });

  test("hover and focus never replace details or expand rows; only explicit selection opens a non-flow inspector", async () => {
    const { root } = mount(session([request()], [tool(), tool({ id: "second" })]));
    const requestRow = row(root, "group:bash");
    const panel = inspector(root);
    const title = panel.querySelector("h3")!.textContent;
    inspect(requestRow).dispatchEvent(new Event("pointerenter"));
    inspect(requestRow).focus();
    expect(panel.querySelector("h3")!.textContent).toBe(title);
    expect(requestRow.dataset.selected).toBe("false");
    expect(fold(requestRow).getAttribute("aria-expanded")).toBe("false");
    expect(panel.getAttribute("popover")).toBe("auto");
    expect(panel.dataset.open).not.toBe("true");
    inspect(requestRow).click();
    await Promise.resolve();
    expect(panel.dataset.open).toBe("true");
    expect(panel.querySelector("h3")!.textContent).toBe("bash ×2");
    button(panel, "Close span details").click();
    await Promise.resolve();
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(inspect(requestRow));
    expect(fold(requestRow).getAttribute("aria-expanded")).toBe("false");
  });

  test("aliases Code Mode and summarizes reported names/statuses without adding child timing rows", async () => {
    const { root, readTools } = mount(
      session(
        [request()],
        [
          tool({
            name: "execute",
            reportedCalls: [
              { name: "read", status: "completed" },
              { name: "read", status: "completed" },
              { name: "read", status: "error" },
              { name: "<script>unsafe</script>", status: "unknown" },
            ],
            reportedCallsTruncated: true,
          }),
        ],
      ),
    );
    expect(readTools).not.toHaveBeenCalled();
    button(root, "Show tools").click();
    await Promise.resolve();
    const invocation = row(root, "tool:tool");
    expect(inspect(invocation).textContent).toBe("Code Mode");
    inspect(invocation).click();
    await Promise.resolve();
    expect(readTools).toHaveBeenCalledExactlyOnceWith({ toolID: "tool" });
    expect(field(root, "Native tool")).toBe("execute");
    expect(field(root, "Invocation")).toBe("100 ms");
    const details = inspector(root).querySelector<HTMLElement>(".trace-reported")!;
    expect(details.hidden).toBe(false);
    expect(details.previousElementSibling?.className).toBe("trace-fields");
    expect(inspector(root).querySelector("details, summary")).toBeNull();
    expect([...details.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
      "read ×2 · completed",
      "read ×1 · error",
      "<script>unsafe</script> ×1 · unknown",
    ]);
    expect(details.querySelector("script, svg, .trace-plot")).toBeNull();
    expect(details.querySelector<HTMLElement>("small")!.hidden).toBe(false);
    expect(root.querySelectorAll(".trace-row")).toHaveLength(2);
    expect(field(root, "Request ID")).toBe("request");
    expect(root.querySelectorAll(".trace-stats strong")[4].textContent).toBe("1");
    expect(root.querySelectorAll(".trace-stats strong")[5].textContent).toBe("0");
  });

  test("keeps popover polling stable, restores focus on Escape, and dismisses on owner scroll or anchor removal", async () => {
    const input = session();
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    await Promise.resolve();
    const source = inspect(row(root, "tool:tool"));
    source.click();
    await Promise.resolve();
    const panel = inspector(root);
    const close = button(panel, "Close span details");
    expect(document.activeElement).toBe(close);
    panel.dispatchEvent(new Event("scroll"));
    expect(panel.dataset.open).toBe("true");
    await view.update({ ...input, revision: 2 });
    expect(document.activeElement).toBe(close);
    expect(panel.dataset.open).toBe("true");
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(source);
    source.click();
    await Promise.resolve();
    root.querySelector(".trace-scroll")!.dispatchEvent(new Event("scroll"));
    expect(panel.dataset.open).toBe("false");
    source.click();
    await Promise.resolve();
    fold(row(root, "session")).click();
    await Promise.resolve();
    expect(panel.dataset.open).toBe("false");
    expect(source.isConnected).toBe(false);
  });

  test("pages visible reported summaries and preserves their page, focus and scroll across polling", async () => {
    const input = session(
      [request()],
      [
        tool({
          name: "execute",
          reportedCalls: Array.from({ length: 21 }, (_, index) => ({
            name: `read${index}`,
            status: "completed",
          })),
        }),
      ],
    );
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    await Promise.resolve();
    inspect(row(root, "tool:tool")).click();
    await Promise.resolve();
    const panel = inspector(root);
    const summaries = panel.querySelector<HTMLElement>(".trace-reported")!;
    expect(summaries.querySelectorAll("li")).toHaveLength(20);
    expect(summaries.querySelector<HTMLElement>("small")!.hidden).toBe(true);
    const next = button(summaries, "Next summaries");
    next.click();
    await Promise.resolve();
    expect(summaries.querySelectorAll("li")).toHaveLength(1);
    expect(summaries.querySelector("li")?.textContent).toBe("read20 ×1 · completed");
    const previous = button(summaries, "Previous summaries");
    previous.focus();
    panel.scrollTop = 80;
    await view.update({ ...input, revision: 2 });
    expect(panel.dataset.open).toBe("true");
    expect(document.activeElement).toBe(previous);
    expect(panel.scrollTop).toBe(80);
    expect(summaries.querySelector("li")?.textContent).toBe("read20 ×1 · completed");
    previous.click();
    await Promise.resolve();
    expect(summaries.querySelectorAll("li")).toHaveLength(20);
    expect(summaries.querySelector("li")?.textContent).toBe("read0 ×1 · completed");
    next.click();
    await Promise.resolve();
    inspect(row(root, "session")).click();
    await Promise.resolve();
    expect(summaries.hidden).toBe(true);
    inspect(row(root, "tool:tool")).click();
    await Promise.resolve();
    expect(summaries.hidden).toBe(false);
    expect(summaries.querySelector("li")?.textContent).toBe("read0 ×1 · completed");
  });

  test("does not invent elapsed time for unknown endpoints but accepts measured zero", async () => {
    const input = session([request({ endedAt: undefined })], [tool({ endedAt: undefined })]);
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    await Promise.resolve();
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("Unavailable");
    for (const key of ["session", "tool:tool"]) {
      const node = row(root, key);
      expect(node.querySelector(".trace-value")?.textContent).toBe("Unavailable");
      expect(node.querySelector<HTMLElement>(".trace-plot")?.dataset.duration).toBe("unknown");
      expect(node.querySelector(".trace-line-main")?.getAttribute("d")).toBe("");
      expect(node.querySelector(".trace-line-unknown")?.getAttribute("d")).toContain(" L");
    }
    inspect(row(root, "tool:tool")).click();
    await Promise.resolve();
    expect(field(root, "Invocation")).toBe("Unavailable");
    expect(button(root, "Zoom selected").disabled).toBe(true);
    await view.update({
      ...input,
      revision: 2,
      requests: [request({ startedAt: 0, endedAt: 0 })],
      tools: [tool({ startedAt: 0, endedAt: 0 })],
    });
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("0 s");
    expect(row(root, "tool:tool").querySelector(".trace-value")?.textContent).toBe("0 s");
    expect(field(root, "Invocation")).toBe("0 s");
    expect(button(root, "Zoom selected").disabled).toBe(false);
  });

  test("bounds 2000 tools to 41 axis rows and pages tool groups and calls by 20", async () => {
    const requests = Array.from({ length: 21 }, (_, index) =>
      request({ id: `r${index}`, startedAt: index }),
    );
    const tools = [
      ...Array.from({ length: 1960 }, (_, index) =>
        tool({ id: `bulk${index}`, requestID: "r0", startedAt: index, endedAt: index + 1 }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        tool({
          id: `single${index}`,
          name: `name${index}`,
          requestID: "r0",
          startedAt: 2000 + index,
        }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        tool({ id: `other${index}`, requestID: `r${index + 1}` }),
      ),
    ];
    const input = session(requests, tools);
    const { root, view } = mount(input);
    const bounded = () => {
      const count = root.querySelectorAll(".trace-row").length;
      expect(count).toBeLessThanOrEqual(41);
      expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.visibleRows).toBe(
        String(count),
      );
    };
    expect(
      root.querySelectorAll('.trace-row[data-kind="group"], .trace-row[data-kind="tool"]'),
    ).toHaveLength(20);
    fold(row(root, "group:bash")).click();
    await Promise.resolve();
    expect(root.querySelectorAll(".trace-row")).toHaveLength(41);
    expect(row(root, "tool:other0")).toBeDefined();
    expect(row(root, "tool:other19")).toBeDefined();
    bounded();
    button(root, "Next calls").click();
    await Promise.resolve();
    expect(row(root, "tool:bulk1940")).toBeDefined();
    expect(row(root, "tool:bulk1959")).toBeDefined();
    expect(root.querySelector('[data-trace-key="tool:other0"]')).toBeNull();
    const invocation = row(root, "tool:bulk1940");
    const focused = inspect(invocation);
    focused.focus();
    const scroll = root.querySelector<HTMLElement>(".trace-scroll")!;
    scroll.scrollTop = 120;
    await view.update({ ...input, revision: 2 });
    expect(row(root, "tool:bulk1940")).toBe(invocation);
    expect(document.activeElement).toBe(focused);
    expect(scroll.scrollTop).toBe(120);
    bounded();
    button(root, "Next tool groups").click();
    await Promise.resolve();
    expect(row(root, "tool:single19")).toBeDefined();
    expect(root.querySelector('[data-trace-key="group:bash"]')).toBeNull();
    bounded();
    expect(root.querySelectorAll(".trace-row")).toHaveLength(2);
    expect(button(root, "Next tool groups").disabled).toBe(true);
    await view.update({ ...input, revision: 3 });
    expect(row(root, "tool:single19")).toBeDefined();
    expect(root.querySelector('[data-trace-key="group:bash"]')).toBeNull();
    button(root, "Previous tool groups").click();
    await Promise.resolve();
    expect(row(root, "group:bash")).toBeDefined();
    button(root, "Latest tools").click();
    await Promise.resolve();
    expect(row(root, "tool:single19")).toBeDefined();
    bounded();
  });

  test("loads native pages only on disclosure and pins their prefix across appended revisions", async () => {
    const calls = Array.from({ length: 45 }, (_, index) => tool({ id: `call${index}` }));
    const input = session([request()], calls);
    const { root, view, readTools } = mount(input);
    expect(readTools).not.toHaveBeenCalled();
    inspect(row(root, "group:bash")).focus();
    expect(readTools).not.toHaveBeenCalled();
    fold(row(root, "group:bash")).click();
    await Promise.resolve();
    expect(readTools).toHaveBeenCalledWith({ group: "bash", cursor: undefined, limit: 20 });
    expect(row(root, "tool:call25")).toBeDefined();
    expect(row(root, "tool:call44")).toBeDefined();
    const cursor = readTools.mock.results[0].value;
    const appended = {
      ...input,
      revision: 2,
      tools: [
        ...calls,
        ...Array.from({ length: 20 }, (_, index) => tool({ id: `call${index + 45}` })),
      ],
    };
    await view.update(appended);
    expect(readTools.mock.calls.at(-1)![0].cursor).toBe((await cursor).cursor);
    expect(row(root, "tool:call25")).toBeDefined();
    expect(root.querySelector('[data-trace-key="tool:call64"]')).toBeNull();
    button(root, "Next calls").click();
    await Promise.resolve();
    expect(row(root, "tool:call5")).toBeDefined();
    expect(row(root, "tool:call24")).toBeDefined();
    button(root, "Previous calls").click();
    await Promise.resolve();
    expect(row(root, "tool:call25")).toBeDefined();
    expect(row(root, "tool:call44")).toBeDefined();
    fold(row(root, "group:bash")).click();
    fold(row(root, "group:bash")).click();
    await Promise.resolve();
    expect(row(root, "tool:call45")).toBeDefined();
    expect(row(root, "tool:call64")).toBeDefined();
    expect(root.querySelectorAll('.trace-row[data-kind="tool"]')).toHaveLength(20);
  });

  test("keeps measured zero tool groups inspectable without treating unknown groups as zero", async () => {
    const input = session(
      [request()],
      [tool({ endedAt: undefined }), tool({ id: "second", endedAt: undefined })],
    );
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    await Promise.resolve();
    const group = row(root, "group:bash");
    inspect(group).click();
    await Promise.resolve();
    expect(field(root, "Execution union U")).toBe("Unavailable");
    expect(button(root, "Zoom selected").disabled).toBe(true);
    await view.update({
      ...input,
      revision: 2,
      tools: input.tools.map((entry) => ({ ...entry, endedAt: entry.startedAt })),
    });
    expect(field(root, "Execution union U")).toBe("0 s");
    expect(group.querySelector(".trace-line-main")?.getAttribute("d")).toContain(" L");
    expect(group.querySelector<HTMLElement>(".trace-plot")?.dataset.duration).toBe("0");
    expect(button(root, "Zoom selected").disabled).toBe(false);
  });

  test("keeps request totals at session level and zooms a short-call marker", async () => {
    const { root } = mount(
      session(
        [
          request({
            firstDeltaAt: 1000,
            cost: 0,
            usage: { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 5 },
          }),
        ],
        [tool({ startedAt: 5000, endedAt: 5001 })],
      ),
    );
    const requestRow = row(root, "session");
    inspect(requestRow).focus();
    inspect(requestRow).click();
    await Promise.resolve();
    expect(requestRow.dataset.selected).toBe("true");
    expect(field(root, "Reported cost")).toBe("$0.00");
    expect(field(root, "Reported tokens")).toBe("15");
    expect(field(root, "Model requests")).toBe("1");
    const invocation = row(root, "tool:tool");
    const path = invocation.querySelector(".trace-line-main")!;
    expect(path.getAttribute("d")).toMatch(/^M[^,]+,13 L[^,]+,17$/);
    const fullPath = path.getAttribute("d");
    invocation.querySelector<HTMLButtonElement>(".trace-plot")!.click();
    await Promise.resolve();
    expect(field(root, "Invocation")).toBe("1 ms");
    button(root, "Zoom selected").click();
    await Promise.resolve();
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("tool:tool");
    expect(root.querySelector(".trace-window")?.textContent).toContain("Zoom");
    const ticks = [...root.querySelectorAll(".trace-ticks span")].map((node) => node.textContent);
    expect(new Set(ticks).size).toBe(4);
    expect(path.getAttribute("d")).not.toBe(fullPath);
    expect(path.getAttribute("d")).toContain("H");
    button(root, "Full session").click();
    await Promise.resolve();
    expect(path.getAttribute("d")).toBe(fullPath);
    expect(button(root, "Full session").disabled).toBe(true);
  });

  test("retains row DOM, focus, scroll, selected inspector and zoom across revisions; caller reset clears them", async () => {
    const input = session(
      [request()],
      [tool({ name: "execute", reportedCalls: [{ name: "read", status: "completed" }] })],
    );
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    await Promise.resolve();
    const invocation = row(root, "tool:tool");
    inspect(invocation).click();
    await Promise.resolve();
    const focus = inspect(invocation);
    focus.focus();
    button(root, "Zoom selected").click();
    await Promise.resolve();
    const details = root.querySelector<HTMLElement>(".trace-reported")!;
    const scroll = root.querySelector<HTMLElement>(".trace-scroll")!;
    scroll.scrollTop = 123;
    scroll.scrollLeft = 45;
    await view.update({
      ...input,
      revision: 2,
      tools: [{ ...input.tools[0], endedAt: 300, resultTokens: 7 }],
    });
    expect(row(root, "tool:tool")).toBe(invocation);
    expect(document.activeElement).toBe(focus);
    expect(scroll.scrollTop).toBe(123);
    expect(scroll.scrollLeft).toBe(45);
    expect(root.querySelector(".trace-reported")).toBe(details);
    expect(details.hidden).toBe(false);
    expect(invocation.dataset.selected).toBe("true");
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("tool:tool");
    expect(field(root, "Invocation")).toBe("200 ms");
    expect(field(root, "Result tokens · estimated")).toBe("≈7");
    view.reset();
    await view.update({ ...input, sessionID: "next", directory: "/next" });
    expect(row(root, "session").dataset.selected).toBe("true");
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("");
    expect(row(root, "tool:tool").dataset.selected).toBe("false");
    expect(details.hidden).toBe(true);
    expect(inspector(root).querySelector(".trace-id")?.textContent).toBe("next");
    expect(fold(row(root, "session")).getAttribute("aria-expanded")).toBe("true");
  });

  test("refreshes running durations on the same revision without mutating source telemetry", async () => {
    const input = session(
      [request({ endedAt: undefined, status: "running" })],
      [tool({ endedAt: undefined, status: "running" })],
    );
    const before = structuredClone(input);
    const { root, view } = mount(input, 1000);
    button(root, "Show tools").click();
    await Promise.resolve();
    const invocation = row(root, "tool:tool");
    inspect(invocation).click();
    await Promise.resolve();
    expect(field(root, "Invocation")).toBe("900 ms");
    await view.update(input, 2000);
    expect(row(root, "tool:tool")).toBe(invocation);
    expect(field(root, "Invocation")).toBe("1.9 s");
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("2 s");
    expect(input).toEqual(before);
  });
});
