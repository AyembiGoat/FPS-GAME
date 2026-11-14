import type { GameState } from '../../core/game';
import { runAccuracyPercent } from '../../core/game';
import type { Loadout } from '../../core/weapon';
import { getWeaponSpec } from '../../core/weapon';
import type { GameAudio } from '../audio';
import { el, formatRunTime } from './dom';
import type { IconName } from './icons';
import { createIcon } from './icons';
import { createKeyHint } from './keycaps';

export interface MenuEntrySpec {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly primary?: boolean;
  readonly sublabel?: string;
  readonly onSelect: () => void;
}

function buildNavigableMenu(
  entries: readonly MenuEntrySpec[],
  audio: GameAudio,
  getActive: () => boolean,
) {
  const list = el('nav', 'ui-menu-list');
  const buttons: HTMLButtonElement[] = [];
  const sublabels = new Map<string, HTMLElement>();
  let focusedIndex = 0;

  function setFocused(index: number, playSound: boolean) {
    const clamped = ((index % buttons.length) + buttons.length) % buttons.length;
    if (clamped !== focusedIndex && playSound) audio.uiHover();
    focusedIndex = clamped;
    buttons.forEach((btn, idx) => {
      btn.dataset.focused = idx === focusedIndex ? 'true' : 'false';
    });
  }

  entries.forEach((entry, idx) => {
    const btn = el('button', entry.primary ? 'ui-menu-btn ui-menu-btn--primary' : 'ui-menu-btn');
    btn.type = 'button';
    btn.dataset.entry = entry.id;
    btn.style.setProperty('--item-index', String(idx));
    btn.append(createIcon(entry.icon), el('span', undefined, entry.label));
    if (entry.sublabel !== undefined) {
      const sub = el('span', 'ui-menu-btn__sub', entry.sublabel);
      sublabels.set(entry.id, sub);
      btn.append(sub);
    }

    btn.addEventListener('pointerenter', () => {
      setFocused(idx, true);
    });
    btn.addEventListener('focus', () => {
      setFocused(idx, false);
    });
    btn.addEventListener('click', () => {
      audio.start();
      entry.onSelect();
    });

    buttons.push(btn);
    list.append(btn);
  });

  setFocused(0, false);

  window.addEventListener('keydown', (event) => {
    if (!getActive()) return;
    if (event.key === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      audio.start();
      setFocused(focusedIndex + 1, true);
    } else if (event.key === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      audio.start();
      setFocused(focusedIndex - 1, true);
    } else if (
      (event.key === 'Enter' || event.key === ' ') &&
      document.activeElement !== buttons[focusedIndex]
    ) {
      event.preventDefault();
      audio.start();
      entries[focusedIndex]?.onSelect();
    }
  });

  return {
    element: list,
    resetFocus() {
      setFocused(0, false);
    },
    setSublabel(id: string, text: string) {
      const node = sublabels.get(id);
      if (node) node.textContent = text;
    },
  };
}

export function createIntroScreen(container: HTMLElement, onFinish: () => void) {
  const intro = el('div', 'intro-screen');
  const card = el('div', 'intro-screen__card');
  const kicker = el('div', 'intro-screen__kicker');
  kicker.append(el('span', 'intro-screen__dot'), el('span', undefined, 'Live Fire Course Ready'));

  const title = el('h1', 'intro-screen__title', 'Shoot House');
  const meta = el('div', 'intro-screen__meta');
  meta.append(
    el('span', undefined, '52 m × 40 m Compound'),
    el('span', undefined, '14 AR500 Targets'),
    el('span', undefined, '8 Firearms Armory'),
  );
  const bar = el('div', 'intro-screen__bar');
  const fill = el('div', 'intro-screen__bar-fill');
  bar.append(fill);

  card.append(kicker, title, meta, bar);
  intro.append(card);
  container.append(intro);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    intro.dataset.leaving = 'true';
    window.setTimeout(() => {
      intro.remove();
    }, 360);
    onFinish();
  };

  const timer = window.setTimeout(finish, 1100);
  requestAnimationFrame(() => {
    intro.dataset.running = 'true';
  });

  intro.addEventListener('pointerdown', () => {
    window.clearTimeout(timer);
    finish();
  });
  window.addEventListener(
    'keydown',
    () => {
      window.clearTimeout(timer);
      finish();
    },
    { once: true },
  );

  return { skip: finish };
}

export function createTitleScreen(
  container: HTMLElement,
  audio: GameAudio,
  actions: {
    readonly onPlay: () => void;
    readonly onLoadout: () => void;
    readonly onSettings: () => void;
    readonly onControls: () => void;
  },
) {
  const screen = el('section', 'ui-screen title-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Main menu');

  const topSpacer = el('div');
  const body = el('div', 'title-screen__body');
  const lockup = el('div', 'title-lockup');
  lockup.append(
    el('div', 'title-lockup__tag', 'Live Fire Training Facility'),
    el('h1', 'title-lockup__heading', 'Shoot House'),
    el(
      'p',
      'title-lockup__subtitle',
      'Clear fourteen high-contrast AR500 steel silhouettes across the CQB Breach House, Central Yard, and 38 m Sniper Lane.',
    ),
  );

  const specs = el('div', 'title-specs');
  const specLoadout = el('span', undefined, 'HK416 + M1911');
  specs.append(
    specLoadout,
    el('span', 'title-specs__sep'),
    el('span', undefined, '14 Targets'),
    el('span', 'title-specs__sep'),
    el('span', undefined, '3 Tactical Zones'),
  );
  lockup.append(specs);

  let isActive = false;
  const nav = buildNavigableMenu(
    [
      {
        id: 'play',
        label: 'Play',
        icon: 'play',
        primary: true,
        sublabel: 'Enter Range',
        onSelect: () => {
          audio.uiConfirm();
          actions.onPlay();
        },
      },
      {
        id: 'loadout',
        label: 'Loadout',
        icon: 'loadout',
        sublabel: 'HK416 · M1911',
        onSelect: () => {
          audio.uiSelect();
          actions.onLoadout();
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        onSelect: () => {
          audio.uiSelect();
          actions.onSettings();
        },
      },
      {
        id: 'controls',
        label: 'Controls',
        icon: 'controls',
        onSelect: () => {
          audio.uiSelect();
          actions.onControls();
        },
      },
    ],
    audio,
    () => isActive,
  );

  body.append(lockup, nav.element);

  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('↑ / ↓', 'Navigate'),
    createKeyHint('Enter', 'Select'),
    createKeyHint('Mouse', 'Click to Select'),
  );
  footer.append(hints);

  screen.append(topSpacer, body, footer);
  container.append(screen);

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      if (active) nav.resetFocus();
    },
    syncLoadout(loadout: Loadout) {
      const p = getWeaponSpec(loadout.primary).name;
      const s = getWeaponSpec(loadout.secondary).name;
      specLoadout.textContent = `${p} + ${s}`;
      nav.setSublabel('loadout', `${p} · ${s}`);
    },
  };
}

export function createPauseScreen(
  container: HTMLElement,
  audio: GameAudio,
  actions: {
    readonly onResume: () => void;
    readonly onLoadout: () => void;
    readonly onRestart: () => void;
    readonly onSettings: () => void;
    readonly onControls: () => void;
    readonly onQuitToTitle: () => void;
  },
) {
  const screen = el('section', 'ui-screen pause-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Paused');

  const header = el('header', 'ui-screen__header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'Shoot House · Session Paused'),
    el('h1', 'ui-screen__title', 'Paused'),
  );
  header.append(titleBlock);

  const body = el('div', 'pause-screen__body');
  let isActive = false;
  const nav = buildNavigableMenu(
    [
      {
        id: 'resume',
        label: 'Resume',
        icon: 'resume',
        primary: true,
        onSelect: () => {
          audio.uiConfirm();
          actions.onResume();
        },
      },
      {
        id: 'loadout',
        label: 'Loadout',
        icon: 'loadout',
        sublabel: 'HK416 · M1911',
        onSelect: () => {
          audio.uiSelect();
          actions.onLoadout();
        },
      },
      {
        id: 'restart',
        label: 'Restart Run',
        icon: 'restart',
        onSelect: () => {
          audio.uiConfirm();
          actions.onRestart();
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: 'settings',
        onSelect: () => {
          audio.uiSelect();
          actions.onSettings();
        },
      },
      {
        id: 'controls',
        label: 'Controls',
        icon: 'controls',
        onSelect: () => {
          audio.uiSelect();
          actions.onControls();
        },
      },
      {
        id: 'quit',
        label: 'Quit to Title',
        icon: 'quit',
        onSelect: () => {
          audio.uiBack();
          actions.onQuitToTitle();
        },
      },
    ],
    audio,
    () => isActive,
  );

  // Live Run Telemetry Card on the right
  const telemetry = el('aside', 'pause-telemetry');
  telemetry.append(el('div', 'pause-telemetry__heading', 'Current Run'));
  const grid = el('div', 'pause-telemetry__grid');
  const valTargets = el('span', 'pause-telemetry__value', '0 / 14');
  const valTime = el('span', 'pause-telemetry__value', '00:00.00');
  const valShots = el('span', 'pause-telemetry__value', '0');
  const valAccuracy = el('span', 'pause-telemetry__value', '0%');

  for (const [label, node] of [
    ['Targets', valTargets],
    ['Elapsed', valTime],
    ['Shots', valShots],
    ['Accuracy', valAccuracy],
  ] as const) {
    const cell = el('div', 'pause-telemetry__cell');
    cell.append(el('span', 'pause-telemetry__label', label), node);
    grid.append(cell);
  }
  telemetry.append(grid);

  body.append(nav.element, telemetry);

  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('↑ / ↓', 'Navigate'),
    createKeyHint('Enter', 'Select'),
    createKeyHint('Esc', 'Pause Menu'),
  );
  footer.append(hints);

  screen.append(header, body, footer);
  container.append(screen);

  return {
    element: screen,
    setActive(active: boolean) {
      isActive = active;
      screen.dataset.active = active ? 'true' : 'false';
      if (active) nav.resetFocus();
    },
    syncLoadout(loadout: Loadout) {
      const p = getWeaponSpec(loadout.primary).name;
      const s = getWeaponSpec(loadout.secondary).name;
      nav.setSublabel('loadout', `${p} · ${s}`);
    },
    syncTelemetry(state: GameState) {
      const down = state.targetsDown.filter(Boolean).length;
      valTargets.textContent = `${down} / ${state.targetsDown.length}`;
      valTime.textContent = formatRunTime(state.run.elapsed);
      valShots.textContent = String(state.run.shotsFired);
      valAccuracy.textContent = `${runAccuracyPercent(state.run)}%`;
    },
  };
}
