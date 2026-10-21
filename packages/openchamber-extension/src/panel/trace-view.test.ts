// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import type {
  RequestInsight,
  SessionInsight,
  ToolInsight,
} from "@opencode-insight/telemetry/schema";
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
const mounted: Array<{ root: HTMLElement; view: ReturnType<typeof createTraceView> }> = [];
function mount(input = session(), now = 10000) {
  const root = document.createElement("main");
  document.body.append(root);
  const view = createTraceView(root);
  mounted.push({ root, view });
  view.update(input, now);
  return { root, view };
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

  test("expands only explicit request relationships and keeps unmatched tools in an orphan bucket", () => {
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
    expect(root.querySelectorAll('.trace-row[data-kind="tool"]')).toHaveLength(0);
    fold(row(root, "request:request")).click();
    expect(row(root, "tool:tool").style.getPropertyValue("--depth")).toBe("2");
    expect(root.querySelector('[data-trace-key="tool:other-tool"]')).toBeNull();
    expect(root.querySelector('[data-trace-key="tool:missing"]')).toBeNull();
    fold(row(root, "request:other")).click();
    expect(row(root, "tool:other-tool")).toBeDefined();
    expect(root.querySelector('[data-trace-key="tool:tool"]')).toBeNull();
    const orphan = row(root, "request:unassociated");
    inspect(orphan).click();
    expect(inspector(root).textContent).toContain("No parent request is inferred");
    expect(field(root, "Native tools")).toBe("2");
    fold(orphan).click();
    fold(row(root, "group:unassociated:bash")).click();
    expect(row(root, "tool:missing")).toBeDefined();
    expect(row(root, "tool:dangling")).toBeDefined();
  });

  test("hover and focus never replace details or expand rows; only explicit selection opens a non-flow inspector", () => {
    const { root } = mount();
    const requestRow = row(root, "request:request");
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
    expect(panel.dataset.open).toBe("true");
    expect(panel.querySelector("h3")!.textContent).toContain("Request 1");
    button(panel, "Close span details").click();
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(inspect(requestRow));
    expect(fold(requestRow).getAttribute("aria-expanded")).toBe("false");
  });

  test("aliases Code Mode and summarizes reported names/statuses without adding child timing rows", () => {
    const { root } = mount(
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
    button(root, "Show tools").click();
    const invocation = row(root, "tool:tool");
    expect(inspect(invocation).textContent).toBe("Code Mode");
    inspect(invocation).click();
    expect(field(root, "Native tool")).toBe("execute");
    expect(field(root, "Invocation")).toBe("100 ms");
    const details = root.querySelector<HTMLDetailsElement>(".trace-reported")!;
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.textContent).toContain("Per-call timing unavailable");
    expect([...details.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
      "read ×2 · completed",
      "read ×1 · error",
      "<script>unsafe</script> ×1 · unknown",
    ]);
    expect(details.querySelector("script, svg, .trace-plot")).toBeNull();
    expect(details.querySelector<HTMLElement>("small")!.hidden).toBe(false);
    expect(root.querySelectorAll(".trace-row")).toHaveLength(3);
    expect(field(root, "Request ID")).toBe("request");
    expect(inspector(root).textContent).toContain("child calls have no independent timing or cost");
    expect(root.querySelectorAll(".trace-stats strong")[4].textContent).toBe("1");
    expect(root.querySelectorAll(".trace-stats strong")[5].textContent).toBe("0");
  });

  test("keeps popover polling stable, restores focus on Escape, and dismisses on owner scroll or anchor removal", () => {
    const input = session();
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    const source = inspect(row(root, "tool:tool"));
    source.click();
    const panel = inspector(root);
    const close = button(panel, "Close span details");
    expect(document.activeElement).toBe(close);
    panel.dispatchEvent(new Event("scroll"));
    expect(panel.dataset.open).toBe("true");
    view.update({ ...input, revision: 2 });
    expect(document.activeElement).toBe(close);
    expect(panel.dataset.open).toBe("true");
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.dataset.open).toBe("false");
    expect(document.activeElement).toBe(source);
    source.click();
    root.querySelector(".trace-scroll")!.dispatchEvent(new Event("scroll"));
    expect(panel.dataset.open).toBe("false");
    source.click();
    fold(row(root, "request:request")).click();
    expect(panel.dataset.open).toBe("false");
    expect(source.isConnected).toBe(false);
  });

  test("does not invent elapsed time for unknown endpoints but accepts measured zero", () => {
    const input = session([request({ endedAt: undefined })], [tool({ endedAt: undefined })]);
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("Unavailable");
    for (const key of ["session", "request:request", "tool:tool"]) {
      const node = row(root, key);
      expect(node.querySelector(".trace-value")?.textContent).toBe("Unavailable");
      expect(node.querySelector<HTMLElement>(".trace-plot")?.dataset.duration).toBe("unknown");
      expect(node.querySelector(".trace-line-main")?.getAttribute("d")).toBe("");
      expect(node.querySelector(".trace-line-unknown")?.getAttribute("d")).toContain(" L");
    }
    inspect(row(root, "tool:tool")).click();
    expect(field(root, "Invocation")).toBe("Unavailable");
    expect(button(root, "Zoom selected").disabled).toBe(true);
    view.update({
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

  test("bounds 2000 tools to 61 axis rows and pages requests, tool groups and calls by 20", () => {
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
    const { root } = mount(session(requests, tools));
    const bounded = () => {
      const count = root.querySelectorAll(".trace-row").length;
      expect(count).toBeLessThanOrEqual(61);
      expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.visibleRows).toBe(
        String(count),
      );
    };
    expect(root.querySelectorAll('.trace-row[data-kind="request"]')).toHaveLength(1);
    button(root, "Previous requests").click();
    expect(root.querySelectorAll('.trace-row[data-kind="request"]')).toHaveLength(20);
    fold(row(root, "request:r0")).click();
    expect(
      root.querySelectorAll('.trace-row[data-kind="group"], .trace-row[data-kind="tool"]'),
    ).toHaveLength(20);
    fold(row(root, "group:r0:bash")).click();
    expect(root.querySelectorAll(".trace-row")).toHaveLength(61);
    expect(row(root, "tool:bulk0")).toBeDefined();
    expect(row(root, "tool:bulk19")).toBeDefined();
    bounded();
    button(root, "Next calls").click();
    expect(row(root, "tool:bulk20")).toBeDefined();
    expect(row(root, "tool:bulk39")).toBeDefined();
    expect(root.querySelector('[data-trace-key="tool:bulk0"]')).toBeNull();
    bounded();
    button(root, "Next tool groups").click();
    expect(row(root, "tool:single19")).toBeDefined();
    expect(root.querySelector('[data-trace-key="group:r0:bash"]')).toBeNull();
    bounded();
    button(root, "Next requests").click();
    expect(row(root, "request:r20")).toBeDefined();
    expect(root.querySelectorAll('.trace-row[data-kind="request"]')).toHaveLength(1);
    expect(button(root, "Next requests").disabled).toBe(true);
    bounded();
  });

  test("keeps measured zero tool groups inspectable without treating unknown groups as zero", () => {
    const input = session(
      [request()],
      [tool({ endedAt: undefined }), tool({ id: "second", endedAt: undefined })],
    );
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    const group = row(root, "group:request:bash");
    inspect(group).click();
    expect(field(root, "Execution union U")).toBe("Unavailable");
    expect(button(root, "Zoom selected").disabled).toBe(true);
    view.update({
      ...input,
      revision: 2,
      tools: input.tools.map((entry) => ({ ...entry, endedAt: entry.startedAt })),
    });
    expect(field(root, "Execution union U")).toBe("0 s");
    expect(group.querySelector(".trace-line-main")?.getAttribute("d")).toContain(" L");
    expect(group.querySelector<HTMLElement>(".trace-plot")?.dataset.duration).toBe("0");
    expect(button(root, "Zoom selected").disabled).toBe(false);
  });

  test("shows selected request details, splits first delta and zooms a short-call marker", () => {
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
    const requestRow = row(root, "request:request");
    inspect(requestRow).focus();
    inspect(requestRow).click();
    expect(requestRow.dataset.selected).toBe("true");
    expect(field(root, "First delta")).toBe("1 s");
    expect(field(root, "Reported cost")).toBe("$0.00");
    expect(field(root, "Output / reasoning")).toBe("2 / 3");
    expect(requestRow.querySelector(".trace-line-waiting")?.getAttribute("d")).toContain("H");
    expect(requestRow.querySelector(".trace-line-streaming")?.getAttribute("d")).toContain("H");
    fold(requestRow).click();
    const invocation = row(root, "tool:tool");
    const path = invocation.querySelector(".trace-line-main")!;
    expect(path.getAttribute("d")).toMatch(/^M[^,]+,13 L[^,]+,17$/);
    const fullPath = path.getAttribute("d");
    invocation.querySelector<HTMLButtonElement>(".trace-plot")!.click();
    expect(field(root, "Invocation")).toBe("1 ms");
    button(root, "Zoom selected").click();
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("tool:tool");
    expect(root.querySelector(".trace-window")?.textContent).toContain("Zoom");
    const ticks = [...root.querySelectorAll(".trace-ticks span")].map((node) => node.textContent);
    expect(new Set(ticks).size).toBe(4);
    expect(path.getAttribute("d")).not.toBe(fullPath);
    expect(path.getAttribute("d")).toContain("H");
    button(root, "Full session").click();
    expect(path.getAttribute("d")).toBe(fullPath);
    expect(button(root, "Full session").disabled).toBe(true);
  });

  test("retains row DOM, focus, scroll, selected inspector and zoom across revisions; caller reset clears them", () => {
    const input = session(
      [request()],
      [tool({ name: "execute", reportedCalls: [{ name: "read", status: "completed" }] })],
    );
    const { root, view } = mount(input);
    button(root, "Show tools").click();
    const invocation = row(root, "tool:tool");
    inspect(invocation).click();
    const focus = inspect(invocation);
    focus.focus();
    button(root, "Zoom selected").click();
    const details = root.querySelector<HTMLDetailsElement>(".trace-reported")!;
    details.open = true;
    const scroll = root.querySelector<HTMLElement>(".trace-scroll")!;
    scroll.scrollTop = 123;
    scroll.scrollLeft = 45;
    view.update({
      ...input,
      revision: 2,
      tools: [{ ...input.tools[0], endedAt: 300, resultTokens: 7 }],
    });
    expect(row(root, "tool:tool")).toBe(invocation);
    expect(document.activeElement).toBe(focus);
    expect(scroll.scrollTop).toBe(123);
    expect(scroll.scrollLeft).toBe(45);
    expect(root.querySelector(".trace-reported")).toBe(details);
    expect(details.open).toBe(true);
    expect(invocation.dataset.selected).toBe("true");
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("tool:tool");
    expect(field(root, "Invocation")).toBe("200 ms");
    expect(field(root, "Result tokens · estimated")).toBe("≈7");
    view.reset();
    view.update({ ...input, sessionID: "next", directory: "/next" });
    expect(row(root, "session").dataset.selected).toBe("true");
    expect(root.querySelector<HTMLElement>(".trace-view")?.dataset.zoomed).toBe("");
    expect(root.querySelector('[data-trace-key="tool:tool"]')).toBeNull();
    expect(details.open).toBe(false);
    expect(inspector(root).querySelector(".trace-id")?.textContent).toBe("next");
    expect(fold(row(root, "request:request")).getAttribute("aria-expanded")).toBe("false");
  });

  test("refreshes running durations on the same revision without mutating source telemetry", () => {
    const input = session(
      [request({ endedAt: undefined, status: "running" })],
      [tool({ endedAt: undefined, status: "running" })],
    );
    const before = structuredClone(input);
    const { root, view } = mount(input, 1000);
    button(root, "Show tools").click();
    const invocation = row(root, "tool:tool");
    inspect(invocation).click();
    expect(field(root, "Invocation")).toBe("900 ms");
    view.update(input, 2000);
    expect(row(root, "tool:tool")).toBe(invocation);
    expect(field(root, "Invocation")).toBe("1.9 s");
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("2 s");
    expect(inspector(root).textContent).toContain("Ongoing durations are provisional");
    expect(input).toEqual(before);
  });
});
