import { connectHost } from "@openchamber/sdk";
import { createPanelController } from "./controller";
import { createPanelView } from "./view";
import { applyPanelTheme } from "./theme";

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app")!;
let view: ReturnType<typeof createPanelView> | undefined;
let controller: ReturnType<typeof createPanelController> | undefined;
const unsubscribeTheme = host.onReady((ready) => {
  applyPanelTheme(ready);
  if (view) return;
  view = createPanelView(root, () => controller?.retry());
  controller = createPanelController(host, (state) => view!.render(state));
});
window.addEventListener(
  "pagehide",
  () => {
    controller?.dispose();
    view?.dispose();
    unsubscribeTheme();
    host.dispose();
  },
  { once: true },
);
