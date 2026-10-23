import { mountButton } from "@openchamber/sdk/ui";
import { element, setText } from "./dom";

export const TRACE_PAGE_SIZE = 20;

export const lastTracePage = (total: number) => Math.max(0, Math.ceil(total / TRACE_PAGE_SIZE) - 1);
export const clampTracePage = (page: number, total: number) =>
  Math.max(0, Math.min(page, lastTracePage(total)));

export function createTracePager(label: string, changed: (page: number) => void) {
  const node = element("div", "trace-pager");
  const before = element("span");
  const count = element("span", "muted");
  const after = element("span");
  node.append(before, count, after);
  let page = 0;
  const previous = mountButton(before, {
    label: `Previous ${label}`,
    size: "xs",
    variant: "ghost",
    onClick: () => changed(page - 1),
  });
  const next = mountButton(after, {
    label: `Next ${label}`,
    size: "xs",
    variant: "ghost",
    onClick: () => changed(page + 1),
  });
  return {
    node,
    update(
      current: number,
      total: number,
      navigation?: { previous: boolean; next: boolean; first?: number; last?: number },
    ) {
      page = current;
      node.hidden = total <= TRACE_PAGE_SIZE;
      previous.update({ disabled: navigation ? !navigation.previous : page === 0 });
      next.update({ disabled: navigation ? !navigation.next : page >= lastTracePage(total) });
      setText(
        count,
        `${label} ${navigation?.first ?? page * TRACE_PAGE_SIZE + 1}–${navigation?.last ?? Math.min(total, (page + 1) * TRACE_PAGE_SIZE)} / ${total}`,
      );
    },
    dispose() {
      previous.dispose();
      next.dispose();
      node.remove();
    },
  };
}
