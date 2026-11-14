/** A tiny element builder, so the menu can be read as layout rather than DOM calls. */

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

export function elementById(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

/** A bordered box with a heading, the menu's only grouping. */
export function panel(title: string, ...children: Node[]): HTMLElement {
  const box = createEl('section', undefined, 'panel');
  box.append(createEl('h2', title), ...children);
  return box;
}

/** Says that what follows is not in the game yet. */
export function notYet(): HTMLElement {
  return createEl('span', 'Not in the game yet', 'tag');
}

export function hint(text: string): HTMLElement {
  return createEl('p', text, 'hint');
}
