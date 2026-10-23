// @vitest-environment jsdom
import { EMPTY_GUEST_CONNECTION, type HostReadyContext } from "@openchamber/sdk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { applyPanelTheme, sourceColors, usageColors } from "./theme";

function ready(mode: "light" | "dark" = "light"): HostReadyContext {
  return {
    theme: {
      mode,
      tokens: {
        background: "Canvas",
        elevated: "ButtonFace",
        foreground: "CanvasText",
        muted: "GrayText",
        subtle: "Canvas",
        border: "ButtonBorder",
        hover: "ButtonFace",
        selection: "SelectedItem",
        focus: "Highlight",
        primary: "LinkText",
        mutedSurface: "ButtonFace",
        elevatedForeground: "ButtonText",
        active: "ActiveText",
        selectionForeground: "SelectedItemText",
        primaryForeground: "Canvas",
        primaryText: "LinkText",
        successText: "CanvasText",
        warningText: "CanvasText",
        errorText: "CanvasText",
        infoText: "CanvasText",
        success: "CanvasText",
        warning: "CanvasText",
        error: "CanvasText",
        info: "CanvasText",
        font: "system-ui",
        mono: "monospace",
        radius: "9px",
      },
    },
    locale: "en",
    directory: null,
    session: null,
    surface: "panel",
    connection: EMPTY_GUEST_CONNECTION,
    settings: {},
    item: null,
  };
}

const palette = (root: HTMLElement) =>
  Array.from({ length: 7 }, (_, index) =>
    root.style.getPropertyValue(`--insight-chart-${index + 1}`),
  );

describe("panel theme", () => {
  test("applies SDK host tokens, selection, font and surface before drawing", () => {
    const root = document.createElement("div");
    applyPanelTheme(ready(), root);
    expect(root.dataset.ocSurface).toBe("panel");
    expect(root.dataset.ocTheme).toBe("light");
    expect(root.style.getPropertyValue("--oc-bg")).toBe("Canvas");
    expect(root.style.getPropertyValue("--interactive-selection")).toBe("SelectedItem");
    expect(root.style.getPropertyValue("--oc-selection-fg")).toBe("SelectedItemText");
    expect(root.style.getPropertyValue("--oc-focus")).toBe("Highlight");
    expect(root.style.fontFamily).toBe("system-ui");
  });

  test("refreshes dark/light snapshots and replaces cleared optional syntax colors", () => {
    const root = document.createElement("div");
    const dark = ready("dark");
    Object.assign(dark.theme.tokens, {
      foreground: "ButtonText",
      syntaxKeyword: "LinkText",
      syntaxNumber: "ActiveText",
      syntaxString: "VisitedText",
      syntaxFunction: "Highlight",
      syntaxType: "CanvasText",
      syntaxVariable: "ButtonText",
      syntaxOperator: "GrayText",
    });
    applyPanelTheme(dark, root);
    expect(root.style.colorScheme).toBe("dark");
    expect(palette(root)).toEqual([
      "LinkText",
      "ActiveText",
      "VisitedText",
      "Highlight",
      "CanvasText",
      "ButtonText",
      "GrayText",
    ]);
    const light = ready();
    light.surface = "page";
    applyPanelTheme(light, root);
    expect(root.style.colorScheme).toBe("light");
    expect(root.dataset.ocTheme).toBe("light");
    expect(root.dataset.ocSurface).toBe("page");
    expect(root.style.getPropertyValue("--oc-fg")).toBe("CanvasText");
    for (const name of [
      "keyword",
      "number",
      "string",
      "function",
      "type",
      "variable",
      "operator",
    ]) {
      expect(root.style.getPropertyValue(`--oc-syntax-${name}`)).toBe("");
      expect(root.style.getPropertyValue(`--syntax-${name}`)).toBe("");
    }
    expect(new Set(palette(root)).size).toBe(7);
    for (const color of palette(root)) {
      expect(color).toContain("color-mix(in srgb, var(--oc-primary)");
      expect(color).toContain("var(--oc-fg)");
    }
  });

  test("chart identity is independent of semantic feedback and selection colors", () => {
    const root = document.createElement("div");
    const snapshot = ready();
    applyPanelTheme(snapshot, root);
    const before = palette(root);
    Object.assign(snapshot.theme.tokens, {
      success: "LinkText",
      warning: "Highlight",
      error: "ActiveText",
      info: "VisitedText",
      warningText: "ButtonText",
      errorText: "ButtonText",
      infoText: "ButtonText",
      selection: "Highlight",
      selectionForeground: "HighlightText",
    });
    applyPanelTheme(snapshot, root);
    expect(palette(root)).toEqual(before);
    for (const color of [...Object.values(sourceColors), ...Object.values(usageColors)]) {
      expect(color).toMatch(/^var\(--insight-chart-[1-7]\)$/);
    }
    expect(root.style.getPropertyValue("--insight-speed-output")).toBe(usageColors.output);
  });

  test("defaults to the document root", () => {
    applyPanelTheme(ready());
    expect(document.documentElement.dataset.ocTheme).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--insight-chart-1")).not.toBe("");
  });

  test("hidden graph containers override their flex layout rules", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../../panel/index.html"), "utf8");
    const style = document.createElement("style");
    style.textContent = html.match(/<style>([\s\S]*?)<\/style>/)![1];
    const root = document.createElement("main");
    document.head.append(style);
    document.body.append(root);
    try {
      for (const name of ["section-head", "tooltip", "timing-meta"]) {
        const container = document.createElement("div");
        container.className = name;
        container.hidden = true;
        root.append(container);
        expect(getComputedStyle(container).display, name).toBe("none");
      }
    } finally {
      style.remove();
      root.remove();
    }
  });
});
