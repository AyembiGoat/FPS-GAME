/** Small helpers for building plain HTML. Keep markup readable, nothing clever. */

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (text !== undefined) created.textContent = text;
  return created;
}

export function button(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
  const created = element('button', label);
  created.type = 'button';
  created.className = selected ? 'menu-button is-selected' : 'menu-button';
  created.addEventListener('click', onClick);
  return created;
}

export function heading(level: 2 | 3 | 4, text: string): HTMLElement {
  if (level === 2) return element('h2', text);
  if (level === 3) return element('h3', text);
  return element('h4', text);
}

/** A titled box. Everything on a screen sits in one of these. */
export function box(title: string): { box: HTMLElement; body: HTMLElement } {
  const wrapper = element('div');
  wrapper.className = 'menu-box';
  const body = element('div');
  body.className = 'menu-box-body';
  wrapper.append(heading(3, title), body);
  return { box: wrapper, body };
}

export function note(text: string): HTMLParagraphElement {
  const created = element('p', text);
  created.className = 'menu-note';
  return created;
}

/** Marks a thing that is shown in its place but does not exist in the game yet. */
export function pendingTag(): HTMLSpanElement {
  const created = element('span', 'Not in the game yet');
  created.className = 'menu-tag';
  return created;
}

export function pendingNote(text: string): HTMLDivElement {
  const created = element('div');
  created.className = 'menu-pending';
  created.append(pendingTag(), element('span', text));
  return created;
}

/** Two-column list of labels and values. */
export function pairs(rows: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = element('dl');
  list.className = 'menu-pairs';
  for (const [label, value] of rows) list.append(element('dt', label), element('dd', value));
  return list;
}

/** Label, then the buttons for one choice. */
export function choice(
  label: string,
  options: readonly { readonly id: string; readonly label: string; readonly selected: boolean }[],
  onPick: (id: string) => void,
): HTMLDivElement {
  const wrapper = element('div');
  wrapper.className = 'menu-choice';
  wrapper.append(heading(4, label));
  const row = element('div');
  row.className = 'menu-buttons';
  for (const option of options) {
    row.append(
      button(option.label, option.selected, () => {
        onPick(option.id);
      }),
    );
  }
  wrapper.append(row);
  return wrapper;
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${rest.toFixed(1).padStart(4, '0')}` : `${rest.toFixed(1)}s`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toISOString().slice(0, 10);
}
