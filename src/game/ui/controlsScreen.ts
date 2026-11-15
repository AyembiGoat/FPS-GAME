import type { GameAudio } from '../audio';
import { el } from './dom';
import { createIcon } from './icons';
import type { BindingSpec } from './keycaps';
import { createBindingGroup, createKeyHint } from './keycaps';

interface ControlRowSpec {
  readonly action: string;
  readonly bindings: readonly BindingSpec[];
}

interface ControlSectionSpec {
  readonly title: string;
  readonly rows: readonly ControlRowSpec[];
}

const CONTROL_SECTIONS: readonly ControlSectionSpec[] = [
  {
    title: 'Movement',
    rows: [
      { action: 'Move Forward', bindings: [{ kind: 'key', label: 'W' }] },
      { action: 'Move Backward', bindings: [{ kind: 'key', label: 'S' }] },
      { action: 'Strafe Left', bindings: [{ kind: 'key', label: 'A' }] },
      { action: 'Strafe Right', bindings: [{ kind: 'key', label: 'D' }] },
      { action: 'Sprint (Hold)', bindings: [{ kind: 'key', label: 'Left Shift', wide: true }] },
      { action: 'Jump', bindings: [{ kind: 'key', label: 'Space', wide: true }] },
    ],
  },
  {
    title: 'Combat & Arsenal',
    rows: [
      { action: 'Look / Aim', bindings: [{ kind: 'mouse', button: 'move', label: 'Mouse' }] },
      {
        action: 'Fire Weapon',
        bindings: [{ kind: 'mouse', button: 'left', label: 'Left Click' }],
      },
      {
        action: 'Aim / Scope (Hold or Toggle)',
        bindings: [{ kind: 'mouse', button: 'right', label: 'Right Click' }],
      },
      {
        action: 'Toggle Variable Scope Zoom (LPVO / Sniper)',
        bindings: [{ kind: 'key', label: 'V' }],
      },
      { action: 'Reload Magazine', bindings: [{ kind: 'key', label: 'R' }] },
      { action: 'Equip Primary Weapon', bindings: [{ kind: 'key', label: '1' }] },
      { action: 'Equip Secondary Weapon', bindings: [{ kind: 'key', label: '2' }] },
      {
        action: 'Quick-Swap Primary / Secondary',
        bindings: [{ kind: 'key', label: 'Scroll Wheel', wide: true }],
      },
    ],
  },
  {
    title: 'Healing & Boosts',
    rows: [
      { action: 'Heal (best item for your health)', bindings: [{ kind: 'key', label: 'H' }] },
      { action: 'Boost (energy drink or painkillers)', bindings: [{ kind: 'key', label: 'B' }] },
      { action: 'Med Kit', bindings: [{ kind: 'key', label: '7' }] },
      { action: 'First Aid Kit', bindings: [{ kind: 'key', label: '8' }] },
      { action: 'Bandage', bindings: [{ kind: 'key', label: '9' }] },
      { action: 'Energy Drink', bindings: [{ kind: 'key', label: '0' }] },
      { action: 'Painkillers', bindings: [{ kind: 'key', label: '-' }] },
    ],
  },
  {
    title: 'Tactical Stance',
    rows: [
      { action: 'Lean Left (Hold or Toggle)', bindings: [{ kind: 'key', label: 'Q' }] },
      { action: 'Lean Right (Hold or Toggle)', bindings: [{ kind: 'key', label: 'E' }] },
    ],
  },
  {
    title: 'System',
    rows: [
      {
        action: 'Pause / Armory / Release Cursor',
        bindings: [{ kind: 'key', label: 'Esc', wide: true }],
      },
      {
        action: 'Menu Tabs & Navigation',
        bindings: [
          { kind: 'key', label: 'Q / E', wide: true },
          { kind: 'key', label: '↑ ↓', wide: true },
          { kind: 'key', label: 'Enter', wide: true },
        ],
      },
    ],
  },
];

export function createControlsScreen(container: HTMLElement, audio: GameAudio, onBack: () => void) {
  const screen = el('section', 'ui-screen controls-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Controls');

  const header = el('header', 'ui-screen__header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'Input Reference'),
    el('h1', 'ui-screen__title', 'Controls'),
  );
  header.append(titleBlock);

  const frame = el('div', 'subscreen__frame');
  const grid = el('div', 'controls-grid');

  for (const section of CONTROL_SECTIONS) {
    const card = el('section', 'controls-section');
    card.append(el('h2', 'controls-section__title', section.title));
    for (const row of section.rows) {
      const rowEl = el('div', 'controls-row');
      rowEl.append(
        el('span', 'controls-row__action', row.action),
        createBindingGroup(row.bindings),
      );
      card.append(rowEl);
    }
    grid.append(card);
  }
  frame.append(grid);

  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(createKeyHint('Esc', 'Back'));

  const backBtn = el('button', 'ui-footer-btn');
  backBtn.type = 'button';
  backBtn.append(createIcon('back'), el('span', undefined, 'Back'));
  backBtn.addEventListener('pointerenter', () => {
    audio.uiHover();
  });
  backBtn.addEventListener('click', () => {
    audio.start();
    audio.uiBack();
    onBack();
  });

  footer.append(hints, backBtn);
  screen.append(header, frame, footer);
  container.append(screen);

  let isActive = false;
  window.addEventListener('keydown', (event) => {
    if (!isActive) return;
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      audio.uiBack();
      onBack();
    }
  });

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
    },
  };
}
