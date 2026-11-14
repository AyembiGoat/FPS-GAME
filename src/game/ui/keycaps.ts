import { createIcon } from './icons';

export type BindingSpec =
  | { readonly kind: 'key'; readonly label: string; readonly wide?: boolean }
  | { readonly kind: 'mouse'; readonly button: 'left' | 'right' | 'move'; readonly label: string };

export function createKeycap(label: string, wide = false): HTMLElement {
  const kbd = document.createElement('kbd');
  kbd.className = wide || label.length > 2 ? 'ui-keycap ui-keycap--wide' : 'ui-keycap';
  kbd.textContent = label;
  return kbd;
}

export function createMouseBadge(button: 'left' | 'right' | 'move', label: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'ui-mouse-badge';
  const iconName =
    button === 'left' ? 'mouseLeft' : button === 'right' ? 'mouseRight' : 'mouseMove';
  const text = document.createElement('span');
  text.className = 'ui-mouse-badge__label';
  text.textContent = label;
  badge.append(createIcon(iconName, 'ui-icon ui-mouse-badge__icon'), text);
  return badge;
}

export function createBindingGroup(specs: readonly BindingSpec[]): HTMLElement {
  const group = document.createElement('span');
  group.className = 'ui-binding-group';
  specs.forEach((spec, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'ui-binding-sep';
      sep.textContent = '/';
      group.append(sep);
    }
    if (spec.kind === 'key') {
      group.append(createKeycap(spec.label, spec.wide));
    } else {
      group.append(createMouseBadge(spec.button, spec.label));
    }
  });
  return group;
}

export function createKeyHint(keyLabel: string, actionLabel: string): HTMLElement {
  const item = document.createElement('span');
  item.className = 'ui-key-hint';
  const text = document.createElement('span');
  text.className = 'ui-key-hint__action';
  text.textContent = actionLabel;
  item.append(createKeycap(keyLabel, keyLabel.length > 2), text);
  return item;
}
