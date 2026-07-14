import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Heatmap } from "../components/dashboard/heatmap";
import { makeHeatmapDay } from "./factories";

function makeScenarioDays(dates: string[]) {
  return dates.map((date, index) =>
    makeHeatmapDay(date, {
      cost: index + 0.25,
      intensity: (index % 5) as 0 | 1 | 2 | 3 | 4,
      messages: index % 2 === 0 ? 2 : 8,
      tokens: (index + 1) * 1200,
    }),
  );
}

describe("Heatmap", () => {
  it("should disable selection for days without messages", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-15", { messages: 0, tokens: 0, intensity: 0 }),
          makeHeatmapDay("2025-01-16", { messages: 2, tokens: 1200, intensity: 1 }),
        ]}
        selectedDate={null}
        onSelect={onSelect}
      />,
    );

    const quietDayCell = screen.getByText("15").closest("button");
    const activeDayCell = screen.getByText("16").closest("button");

    expect(quietDayCell).not.toBeNull();
    expect(activeDayCell).not.toBeNull();

    const quietDay = quietDayCell!;
    const activeDay = activeDayCell!;

    expect(quietDay).toBeDisabled();
    expect(activeDay).not.toBeDisabled();

    await user.click(quietDay);
    await user.click(activeDay);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("2025-01-16");
  });

  it("should render fixed-height month rows with hidden gap days", () => {
    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-15", { messages: 0, tokens: 0, intensity: 0 }),
          makeHeatmapDay("2025-01-16", { messages: 2, tokens: 1200, intensity: 1 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/january 2025/i, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("15").closest("td")).toHaveClass("aspect-square", "min-w-0");
  });

  it("should show month navigation buttons instead of horizontal scrolling", () => {
    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-15", { messages: 1, tokens: 1000, intensity: 1 }),
          makeHeatmapDay("2025-02-16", { messages: 2, tokens: 1200, intensity: 2 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /^previous month$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^next month$/i })).toBeInTheDocument();
  });

  it("should navigate across available months with explicit controls", async () => {
    const user = userEvent.setup();

    render(
      <Heatmap
        days={[
          makeHeatmapDay("2026-01-15", { messages: 1, tokens: 1000, intensity: 1 }),
          makeHeatmapDay("2026-03-16", { messages: 2, tokens: 1200, intensity: 2 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/march 2026/i, { selector: "p" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^previous month$/i }));
    expect(screen.getByText(/february 2026/i, { selector: "p" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^previous month$/i }));
    expect(screen.getByText(/january 2026/i, { selector: "p" })).toBeInTheDocument();
  });

  it("should show daily cost in the calendar cell and keep tokens in the tooltip", async () => {
    const user = userEvent.setup();

    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-16", { cost: 0.36, messages: 2, tokens: 1200, intensity: 1 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    const dayCell = screen.getByText("16").closest("button");

    expect(dayCell).not.toBeNull();

    const dayButton = dayCell!;

    expect(within(dayButton).getByText("$0.36")).toBeInTheDocument();
    expect(within(dayButton).queryByText("1.2K")).not.toBeInTheDocument();

    await user.hover(dayButton);

    expect((await screen.findAllByText("$0.36 estimated spend")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("1.2K tokens")).length).toBeGreaterThan(0);
  });

  it("should use light spend text on darker heat levels", () => {
    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-16", { cost: 36.47, messages: 2, tokens: 1200, intensity: 4 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    const amount = screen.getByText("$36.47");

    expect(amount).toHaveClass("text-[var(--heat-token-4)]");
  });

  it("should center spend text within the calendar cell", () => {
    render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-09", { cost: 98.1, messages: 2, tokens: 1200, intensity: 4 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("$98.10")).toHaveClass("text-center");
  });

  it("should reset visible month when the range data changes", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-15", { messages: 1, tokens: 1000, intensity: 1 }),
          makeHeatmapDay("2025-03-16", { messages: 2, tokens: 1200, intensity: 2 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^previous month$/i }));
    expect(screen.getByText(/february 2025/i, { selector: "p" })).toBeInTheDocument();

    rerender(
      <Heatmap
        days={[
          makeHeatmapDay("2025-01-15", { messages: 1, tokens: 1000, intensity: 1 }),
          makeHeatmapDay("2025-12-16", { messages: 2, tokens: 1200, intensity: 2 }),
        ]}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/december 2025/i, { selector: "p" })).toBeInTheDocument();
  });

  it("should keep a stable six-row frame across sparse and dense month scenarios", () => {
    const scenarios = [
      {
        label: /february 2026/i,
        days: makeScenarioDays(["2026-02-02", "2026-02-28"]),
      },
      {
        label: /april 2026/i,
        days: makeScenarioDays(["2026-04-01", "2026-04-12", "2026-04-24", "2026-04-30"]),
      },
      {
        label: /august 2026/i,
        days: makeScenarioDays([
          "2026-08-01",
          "2026-08-08",
          "2026-08-16",
          "2026-08-24",
          "2026-08-31",
        ]),
      },
    ];

    const { container, rerender } = render(
      <Heatmap days={scenarios[0].days} selectedDate={null} onSelect={vi.fn()} />,
    );

    const root = container.firstElementChild;

    expect(root).not.toBeNull();
    expect(root).toHaveClass("w-full", "sm:min-h-[32rem]");

    for (const scenario of scenarios) {
      rerender(<Heatmap days={scenario.days} selectedDate={null} onSelect={vi.fn()} />);

      expect(screen.getByText(scenario.label, { selector: "p" })).toBeInTheDocument();
      expect(container.querySelectorAll("td")).toHaveLength(42);
      expect(container.firstElementChild).toHaveClass("w-full", "sm:min-h-[32rem]");
    }
  });

  it("should keep the same six-row calendar frame while navigating across month shapes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Heatmap
        days={makeScenarioDays(["2026-02-28", "2026-03-31", "2026-04-30"])}
        selectedDate={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/april 2026/i, { selector: "p" })).toBeInTheDocument();
    expect(container.querySelectorAll("td")).toHaveLength(42);

    await user.click(screen.getByRole("button", { name: /^previous month$/i }));
    expect(screen.getByText(/march 2026/i, { selector: "p" })).toBeInTheDocument();
    expect(container.querySelectorAll("td")).toHaveLength(42);

    await user.click(screen.getByRole("button", { name: /^previous month$/i }));
    expect(screen.getByText(/february 2026/i, { selector: "p" })).toBeInTheDocument();
    expect(container.querySelectorAll("td")).toHaveLength(42);
  });
});
