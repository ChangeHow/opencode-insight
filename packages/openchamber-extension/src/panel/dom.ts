export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function setText(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

/** Reorder retained rows without replacing their DOM or interactive state. */
export function syncChildren(parent: HTMLElement, children: HTMLElement[]) {
  children.forEach((child, index) => {
    if (parent.children[index] !== child)
      parent.insertBefore(child, parent.children[index] ?? null);
  });
  while (parent.children.length > children.length) parent.lastElementChild!.remove();
}
