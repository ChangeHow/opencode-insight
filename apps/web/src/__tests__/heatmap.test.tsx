import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Heatmap } from "../components/dashboard/heatmap.js";
import { makeHeatmapDay } from "./factories.js";

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
    expect(document.querySelectorAll(".grid.grid-cols-7.gap-2").length).toBeGreaterThanOrEqual(7);
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
});
