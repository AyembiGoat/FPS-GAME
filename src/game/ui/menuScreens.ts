import type { GameState } from '../../core/game';
import { runAccuracyPercent } from '../../core/game';
import type { GameModeId, GameModeSpec } from '../../core/mode';
import { GAME_MODES } from '../../core/mode';
import type { Loadout } from '../../core/weapon';
import { getWeaponSpec } from '../../core/weapon';
import type { GameAudio } from '../audio';
import { el, formatRunTime } from './dom';
import type { IconName } from './icons';
import { createIcon } from './icons';
import { createKeyHint } from './keycaps';

/**
 * One key press must only be consumed by the screen that was open when it was pressed.
 * Opening a screen from the keyboard would otherwise hand the same Enter to the screen that
 * has just appeared, which could start a mode the player never chose.
 */
const consumedKeys = new WeakSet<KeyboardEvent>();

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
    if (!getActive() || consumedKeys.has(event)) return;
    if (event.key === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      audio.start();
      consumedKeys.add(event);
      setFocused(focusedIndex + 1, true);
    } else if (event.key === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      audio.start();
      consumedKeys.add(event);
      setFocused(focusedIndex - 1, true);
    } else if (
      (event.key === 'Enter' || event.key === ' ') &&
      document.activeElement !== buttons[focusedIndex]
    ) {
      event.preventDefault();
      audio.start();
      consumedKeys.add(event);
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

export function createIntroScreen(
  container: HTMLElement,
  onFinish: () => void,
  counts: { readonly hostiles: number; readonly plates: number } = { hostiles: 6, plates: 14 },
) {
  const intro = el('div', 'intro-screen');
  const card = el('div', 'intro-screen__card');
  const kicker = el('div', 'intro-screen__kicker');
  kicker.append(el('span', 'intro-screen__dot'), el('span', undefined, 'Live Fire Course Ready'));

  const title = el('h1', 'intro-screen__title', 'Shoot House');
  const meta = el('div', 'intro-screen__meta');
  meta.append(
    el('span', undefined, '52 m × 40 m Compound'),
    el('span', undefined, `${String(counts.hostiles)} Hostiles`),
    el('span', undefined, `${String(counts.plates)} AR500 Plates`),
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
    readonly onModes: () => void;
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
      'Clear the CQB Breach House, Central Yard and 38 m Sniper Lane. Two ways in: hostile combatants, or steel plates.',
    ),
  );

  const specs = el('div', 'title-specs');
  const specLoadout = el('span', undefined, 'HK416 + M1911');
  const specMode = el('span', undefined, 'Firefight');
  const specZones = el('span', undefined, '3 Tactical Zones');
  specs.append(specLoadout, el('span', 'title-specs__sep'), specMode);
  specs.append(el('span', 'title-specs__sep'), specZones);
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
        id: 'modes',
        label: 'Game Modes',
        icon: 'modes',
        sublabel: 'Firefight · Steel Targets',
        onSelect: () => {
          audio.uiSelect();
          actions.onModes();
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
    syncMode(mode: GameModeSpec) {
      specMode.textContent =
        mode.id === 'firefight'
          ? `${mode.name} · ${mode.enemies ? 'Hostiles' : ''}`
          : `${mode.name} · ${mode.targets ? 'Plates' : ''}`;
      nav.setSublabel('modes', mode.name);
    },
  };
}

/**
 * The Game Modes screen. Every card is a real mode from the core mode table, and picking a
 * card starts that mode: there is nothing listed here that does not deploy.
 */
export function createModesScreen(
  container: HTMLElement,
  audio: GameAudio,
  actions: {
    readonly onDeploy: (mode: GameModeId) => void;
    readonly onBack: () => void;
  },
  counts: { readonly hostiles: number; readonly plates: number },
) {
  const screen = el('section', 'ui-screen modes-screen');
  screen.dataset.active = 'false';
  screen.setAttribute('aria-label', 'Game modes');

  const header = el('header', 'ui-screen__header');
  const titleBlock = el('div', 'ui-screen__title-block');
  titleBlock.append(
    el('span', 'ui-screen__eyebrow', 'Shoot House · Training Programme'),
    el('h1', 'ui-screen__title', 'Game Modes'),
  );
  header.append(titleBlock);

  const body = el('div', 'modes-screen__body');
  const list = el('div', 'modes-list');
  list.setAttribute('role', 'list');

  const cards = GAME_MODES.map((mode, index) => {
    const card = el('button', 'mode-card');
    card.type = 'button';
    card.dataset.entry = `mode-${mode.id}`;
    card.dataset.mode = mode.id;
    card.dataset.focused = index === 0 ? 'true' : 'false';
    card.style.setProperty('--item-index', String(index));
    card.setAttribute('role', 'listitem');

    const indexTag = el('span', 'mode-card__index', String(index + 1).padStart(2, '0'));
    const text = el('span', 'mode-card__body');
    const name = el('span', 'mode-card__name', mode.name);
    const objective = el('span', 'mode-card__objective', mode.objective);
    const description = el('span', 'mode-card__description', mode.description);
    text.append(name, objective, description);

    const tags = el('span', 'mode-card__tags');
    tags.append(
      el(
        'span',
        'mode-card__tag',
        mode.enemies
          ? `${String(counts.hostiles)} hostiles`
          : `${String(counts.plates)} steel plates`,
      ),
      el('span', 'mode-card__tag', mode.enemies ? 'You can be hit' : 'No return fire'),
      el('span', 'mode-card__tag', 'Restarts when cleared'),
    );

    const action = el('span', 'mode-card__action', 'Deploy');
    card.append(indexTag, text, tags, action);
    list.append(card);
    return card;
  });

  const back = el('button', 'ui-menu-btn modes-back');
  back.type = 'button';
  back.dataset.entry = 'modes-back';
  back.dataset.focused = 'false';
  back.append(createIcon('back'), el('span', undefined, 'Back to Title'));
  list.append(back);

  let focused = 0;
  const stops = [...cards, back];
  function setFocused(next: number, sound: boolean) {
    const clamped = ((next % stops.length) + stops.length) % stops.length;
    if (clamped !== focused && sound) audio.uiHover();
    focused = clamped;
    stops.forEach((node, idx) => {
      node.dataset.focused = idx === focused ? 'true' : 'false';
    });
  }

  function activate() {
    const card = cards[focused];
    const mode = card ? GAME_MODES[focused] : undefined;
    if (mode) {
      audio.uiConfirm();
      actions.onDeploy(mode.id);
    } else {
      audio.uiBack();
      actions.onBack();
    }
  }

  stops.forEach((node, idx) => {
    node.addEventListener('pointerenter', () => {
      setFocused(idx, true);
    });
    node.addEventListener('click', () => {
      audio.start();
      setFocused(idx, false);
      activate();
    });
  });

  const brief = el('aside', 'modes-brief');
  brief.append(el('div', 'modes-brief__heading', 'Before You Deploy'));
  const briefList = el('ul', 'modes-brief__list');
  for (const line of [
    'Hostiles spot you by sight and by the sound of your rifle. Break the line of sight and they lose you.',
    'Every hostile needs a clean line of sight before it can shoot. Walls stop bullets both ways.',
    'You regenerate after five seconds out of contact. Standing in the open is how a run ends.',
  ]) {
    briefList.append(el('li', undefined, line));
  }
  brief.append(briefList);
  body.append(list, brief);

  const footer = el('footer', 'ui-screen__footer');
  const hints = el('div', 'ui-screen__hints');
  hints.append(
    createKeyHint('↑ / ↓', 'Choose'),
    createKeyHint('Enter', 'Deploy'),
    createKeyHint('Esc', 'Back'),
  );
  footer.append(hints);

  screen.append(header, body, footer);
  container.append(screen);

  window.addEventListener('keydown', (event) => {
    if (screen.dataset.active !== 'true' || consumedKeys.has(event)) return;
    if (event.key === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      consumedKeys.add(event);
      setFocused(focused + 1, true);
    } else if (event.key === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      consumedKeys.add(event);
      setFocused(focused - 1, true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      consumedKeys.add(event);
      activate();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      consumedKeys.add(event);
      audio.uiBack();
      actions.onBack();
    }
  });

  return {
    element: screen,
    setActive(active: boolean) {
      screen.dataset.active = active ? 'true' : 'false';
      if (active) setFocused(0, false);
    },
  };
}

export function createPauseScreen(
  container: HTMLElement,
  audio: GameAudio,
  actions: {
    readonly onResume: () => void;
    readonly onModes: () => void;
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
        id: 'modes',
        label: 'Game Modes',
        icon: 'modes',
        sublabel: 'Switch mode',
        onSelect: () => {
          audio.uiSelect();
          actions.onModes();
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

  const targetLabelEl = el('span', 'pause-telemetry__label', 'Targets');
  for (const [label, node] of [
    [targetLabelEl, valTargets],
    [el('span', 'pause-telemetry__label', 'Elapsed'), valTime],
    [el('span', 'pause-telemetry__label', 'Shots'), valShots],
    [el('span', 'pause-telemetry__label', 'Accuracy'), valAccuracy],
  ] as const) {
    const cell = el('div', 'pause-telemetry__cell');
    cell.append(label, node);
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
      const alive = state.enemies.filter((enemy) => enemy.behavior !== 'dead').length;
      const down = state.targetsDown.filter(Boolean).length;
      const hostiles = state.mode === 'firefight';
      targetLabelEl.textContent = hostiles ? 'Hostiles' : 'Targets';
      valTargets.textContent = hostiles
        ? `${state.enemies.length - alive} / ${state.enemies.length}`
        : `${down} / ${state.targetsDown.length}`;
      valTime.textContent = formatRunTime(state.run.elapsed);
      valShots.textContent = String(state.run.shotsFired);
      valAccuracy.textContent = `${runAccuracyPercent(state.run)}%`;
    },
  };
}
