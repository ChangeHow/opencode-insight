import { afterAll, beforeAll } from "vitest";

/** jsdom has no top layer; geometry and native dismissal are verified in OCB. */
export function stubPopover() {
  const methods = ["togglePopover", "hidePopover"] as const;
  const previous = methods.map((name) =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
  );
  beforeAll(() => {
    methods.forEach((name) =>
      Object.defineProperty(HTMLElement.prototype, name, {
        configurable: true,
        value(this: HTMLElement, open = false) {
          this.dispatchEvent(
            Object.assign(new Event("toggle"), { newState: open ? "open" : "closed" }),
          );
          return open;
        },
      }),
    );
  });
  afterAll(() =>
    methods.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(HTMLElement.prototype, name, previous[index]!);
      else Reflect.deleteProperty(HTMLElement.prototype, name);
    }),
  );
}
