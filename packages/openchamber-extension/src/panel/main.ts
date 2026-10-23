import { connectHost } from "@openchamber/sdk";
import { createPanelController } from "./controller";
import { createPanelView } from "./view";
import { applyPanelTheme } from "./theme";
import { createSpeedView } from "./speed-view";
import { createStatusLayout } from "./status-layout";

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app")!;
let view: ReturnType<typeof createPanelView> | ReturnType<typeof createSpeedView> | undefined;
let controller: ReturnType<typeof createPanelController> | undefined;
let layout: ReturnType<typeof createStatusLayout> | undefined;
const unsubscribeTheme = host.onReady((ready) => {
  applyPanelTheme(ready);
  if (view) return;
  const surface = ready.surface === "status" ? "status" : "panel";
  const retry = () => controller?.retry();
  const refreshSpeed = () => controller?.requestSpeed();
  if (surface === "status")
    layout = createStatusLayout(root, host, (height) => controller?.saveSpeedHeight(height));
  view =
    surface === "status"
      ? createSpeedView(root, retry, refreshSpeed)
      : createPanelView(root, retry, (input) => controller!.loadTools(input), refreshSpeed);
  controller = createPanelController(
    host,
    (state) => {
      view!.render(state);
      layout?.update(state);
    },
    surface,
    surface === "status"
      ? {
          initial: { sessionID: ready.session?.id ?? null, directory: ready.directory },
          storage: host.storage,
        }
      : undefined,
  );
});
window.addEventListener(
  "pagehide",
  () => {
    controller?.dispose();
    layout?.dispose();
    view?.dispose();
    unsubscribeTheme();
    host.dispose();
  },
  { once: true },
);
