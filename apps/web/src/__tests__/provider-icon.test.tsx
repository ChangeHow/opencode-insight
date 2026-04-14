import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

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
vi.mock("@lobehub/icons/es/XAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="xai" {...props} />,
}));
vi.mock("@lobehub/icons/es/ZAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="zai" {...props} />,
}));
vi.mock("@lobehub/icons/es/Zhipu", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="zhipu" {...props} />,
}));

import { ProviderIcon } from "../components/dashboard/provider-icon";

describe("ProviderIcon", () => {
  test("renders the Moonshot icon for Moonshot providers", () => {
    const { container } = render(<ProviderIcon providerId="moonshotai" />);
    expect(container.querySelector('[data-icon="moonshot"]')).toBeTruthy();
  });

  test("renders the Moonshot icon for Kimi providers", () => {
    const { container } = render(<ProviderIcon providerId="kimi" />);
    expect(container.querySelector('[data-icon="moonshot"]')).toBeTruthy();
  });
});
