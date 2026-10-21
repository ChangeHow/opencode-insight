import { connectHost } from "@openchamber/sdk";
import { applyHostReady } from "@openchamber/sdk/ui";
import { createPanelController } from "./controller";
import { createPanelView } from "./view";

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app")!;
const view = createPanelView(root, () => controller.retry());
const controller = createPanelController(host, (state) => view.render(state));
const unsubscribeTheme = host.onReady((ready) => applyHostReady(ready, document.documentElement));
window.addEventListener(
  "pagehide",
  () => {
    controller.dispose();
    unsubscribeTheme();
    host.dispose();
  },
  { once: true },
);
