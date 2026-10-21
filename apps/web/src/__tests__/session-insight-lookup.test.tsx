import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionInsightLookup } from "../components/dashboard/session-insight-lookup";

afterEach(cleanup);
describe("session insight lookup", () => {
  test("opens a V2 session by ID without legacy usage", () => {
    const select = vi.fn();
    render(<SessionInsightLookup onSelect={select} />);
    const input = screen.getByRole("textbox", { name: "OpenCode V2 session ID" });
    const button = screen.getByRole("button", { name: "View insight" });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "ses_native" } });
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith("ses_native");
    fireEvent.change(input, { target: { value: "codex:session" } });
    expect(button).toBeDisabled();
  });
});
