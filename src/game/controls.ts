/** The key list, shown in the menu and on the pause screen. */

import { CONTROLS } from './menu/content';
import { createEl } from './dom';

/** A definition list of what each key does. */
export function createControls(): HTMLElement {
  const list = createEl('dl', undefined, 'controls');
  for (const [action, keys] of CONTROLS) {
    list.append(createEl('dt', action), createEl('dd', keys));
  }
  return list;
}
