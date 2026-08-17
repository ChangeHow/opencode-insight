import { describe, expect, test, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("@lobehub/icons/es/Anthropic", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="anthropic" {...props} />,
}));
vi.mock("@lobehub/icons/es/ChatGLM", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="chatglm" {...props} />,
}));
vi.mock("@lobehub/icons/es/GithubCopilot", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="copilot" {...props} />,
}));
vi.mock("@lobehub/icons/es/Moonshot", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="moonshot" {...props} />,
}));
vi.mock("@lobehub/icons/es/OpenAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="openai" {...props} />,
}));
vi.mock("@lobehub/icons/es/OpenCode", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="opencode" {...props} />,
}));
vi.mock("@lobehub/icons/es/XAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="xai" {...props} />,
}));
vi.mock("@lobehub/icons/es/ZAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="zai" {...props} />,
}));
vi.mock("@lobehub/icons/es/ZenMux", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="zenmux" {...props} />,
}));
vi.mock("@lobehub/icons/es/Zhipu", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="zhipu" {...props} />,
}));

import { ProviderIcon } from "../components/dashboard/provider-icon";

describe("ProviderIcon", () => {
  test("renders the Moonshot icon for Moonshot providers", async () => {
    const { container } = render(<ProviderIcon providerId="moonshotai" />);
    await waitFor(() => expect(container.querySelector('[data-icon="moonshot"]')).toBeTruthy());
  });

  test("renders the Moonshot icon for Kimi providers", async () => {
    const { container } = render(<ProviderIcon providerId="kimi" />);
    await waitFor(() => expect(container.querySelector('[data-icon="moonshot"]')).toBeTruthy());
  });

  test("renders the OpenCode icon for opencode-go provider", async () => {
    const { container } = render(<ProviderIcon providerId="opencode-go" />);
    await waitFor(() => expect(container.querySelector('[data-icon="opencode"]')).toBeTruthy());
  });

  test("renders the OpenCode icon for opencode provider", async () => {
    const { container } = render(<ProviderIcon providerId="opencode" />);
    await waitFor(() => expect(container.querySelector('[data-icon="opencode"]')).toBeTruthy());
  });

  test("renders the ZenMux icon for zenmux provider", async () => {
    const { container } = render(<ProviderIcon providerId="zenmux" />);
    await waitFor(() => expect(container.querySelector('[data-icon="zenmux"]')).toBeTruthy());
  });

  test("renders the ZenMux icon for hyphenated zen-mux id", async () => {
    const { container } = render(<ProviderIcon providerId="zen-mux" />);
    await waitFor(() => expect(container.querySelector('[data-icon="zenmux"]')).toBeTruthy());
  });
});
