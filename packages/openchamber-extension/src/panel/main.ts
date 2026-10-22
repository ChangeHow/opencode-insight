import { connectHost } from "@openchamber/sdk";
import { createPanelController } from "./controller";
import { createPanelView } from "./view";
import { applyPanelTheme } from "./theme";
import { createSpeedView } from "./speed-view";

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app")!;
let view: ReturnType<typeof createPanelView> | ReturnType<typeof createSpeedView> | undefined;
let controller: ReturnType<typeof createPanelController> | undefined;
const unsubscribeTheme = host.onReady((ready) => {
  applyPanelTheme(ready);
  if (view) return;
  const surface = ready.surface === "status" ? "status" : "panel";
  const retry = () => controller?.retry();
  const refreshSpeed = () => controller?.requestSpeed();
  view =
    surface === "status"
      ? createSpeedView(root, retry, refreshSpeed)
      : createPanelView(root, retry, (input) => controller!.loadTools(input), refreshSpeed);
  controller = createPanelController(
    host,
    (state) => {
      view!.render(state);
      if (surface === "status") void host.setHeight(root.offsetHeight);
    },
    surface,
  );
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
