import { createControls } from '../controls';
import { createEl, elementById, hint, notYet, panel } from '../dom';
import type { Choice, SectionId } from './content';
import {
  ATTACHMENTS,
  DEFAULT_LOADOUT,
  LOADOUTS,
  MAPS,
  MENU_SECTIONS,
  MODES,
  SHOOT_HOUSE,
  SKINS,
  TARGET_PRACTICE,
  WEAPONS,
} from './content';
import { addRun, formatTime, loadName, loadRuns, saveName, summariseRuns } from './storage';
import type { Run } from './storage';
import './menu.css';

/**
 * The main menu: one page per section, laid out here and filled from content.ts,
 * which holds every name and list. Nothing picked here changes the game yet. The
 * menu remembers the picks and can start Shoot House; everything else is labelled
 * as not in the game.
 */

interface MenuSettings {
  name: string;
  section: SectionId;
  loadout: string;
  weapon: string;
  attachments: Record<string, string | undefined>;
  skins: Record<string, string | undefined>;
  map: string;
  mode: string;
}

export interface MenuActions {
  /** Leave the menu and play the chosen map. */
  start: () => void;
}

/** A row of buttons, one per choice. The chosen one is filled in. */
function options(
  choices: readonly Choice[],
  selectedId: string,
  onPick: (id: string) => void,
  columns = 1,
): HTMLElement {
  const list = createEl('div', undefined, columns === 2 ? 'options two' : 'options');
  for (const choice of choices) {
    const button = createEl('button', undefined, 'option');
    button.type = 'button';
    const text = createEl('span', undefined, 'option-text');
    text.append(createEl('span', choice.name));
    if (choice.detail !== undefined) text.append(createEl('span', choice.detail, 'option-detail'));
    button.append(text);

    if (choice.available) {
      if (choice.id === selectedId) button.classList.add('selected');
      button.addEventListener('click', () => {
        onPick(choice.id);
      });
    } else {
      // Shown where it will live, but it cannot be picked and never looks current.
      button.classList.add('placeholder');
      button.disabled = true;
      button.append(notYet());
    }
    list.append(button);
  }
  return list;
}

export function createMenu(actions: MenuActions) {
  const root = elementById('menu');
  const settings: MenuSettings = {
    name: loadName(),
    section: 'profile',
    loadout: DEFAULT_LOADOUT.id,
    weapon: WEAPONS[0]?.id ?? '',
    attachments: {},
    skins: {},
    map: SHOOT_HOUSE.id,
    mode: TARGET_PRACTICE.id,
  };
  let nameLabel: HTMLElement | null = null;

  function set<K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) {
    settings[key] = value;
    render();
  }

  function nameText(): string {
    return settings.name.trim() === '' ? 'No name set' : settings.name.trim();
  }

  function namePanel(): HTMLElement {
    const input = createEl('input', undefined, 'text-input');
    input.type = 'text';
    input.maxLength = 20;
    input.placeholder = 'Your name';
    input.value = settings.name;
    // Typing only redraws the name in the navigation bar: rebuilding the page would
    // take the caret out of the field mid-word.
    input.addEventListener('input', () => {
      settings.name = input.value;
      saveName(input.value);
      if (nameLabel) nameLabel.textContent = nameText();
    });
    return panel('Player name', input, hint('Saved in this browser.'));
  }

  function playerPanel(): HTMLElement {
    const runs = loadRuns();
    const summary = summariseRuns(runs);
    const stats = createEl('dl', undefined, 'stats');
    if (summary.played === 0) {
      stats.append(createEl('dd', 'No stats yet. Finish a run and they appear here.'));
    } else {
      const accuracy = Math.round((summary.accuracy ?? 0) * 100);
      const rows: readonly (readonly [string, string])[] = [
        ['Runs played', `${summary.played}`],
        ['Best time', formatTime(summary.bestSeconds ?? 0)],
        ['Shots fired', `${summary.shots}`],
        ['Accuracy', `${accuracy}%`],
      ];
      for (const [label, value] of rows) {
        stats.append(createEl('dt', label), createEl('dd', value));
      }
    }
    return panel('Player', stats);
  }

  function characterPanel(): HTMLElement {
    // The character has no model yet, so its place is an empty frame with a label.
    const figure = createEl('div', undefined, 'figure');
    figure.append(notYet(), createEl('span', 'The character will be shown here.'));
    return panel('Character', figure, hint('Choosing a character is not in the game yet.'));
  }

  function runsTable(runs: readonly Run[]): HTMLElement {
    if (runs.length === 0) return createEl('p', 'No runs yet.', 'empty');
    const table = createEl('table', undefined, 'runs');
    const head = createEl('thead');
    const headRow = createEl('tr');
    for (const label of ['Map', 'Mode', 'Time', 'Targets', 'Date']) {
      headRow.append(createEl('th', label));
    }
    head.append(headRow);

    const body = createEl('tbody');
    for (const run of runs) {
      const row = createEl('tr');
      const cells = [
        run.map,
        run.mode,
        formatTime(run.seconds),
        `${run.targetsHit} / ${run.targetsTotal}`,
        new Date(run.date).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
      ];
      for (const cell of cells) row.append(createEl('td', cell));
      body.append(row);
    }
    table.append(head, body);
    return table;
  }

  function profilePage(): HTMLElement {
    const top = createEl('div', undefined, 'split split-2');
    top.append(namePanel(), playerPanel());

    const bottom = createEl('div', undefined, 'split split-2');
    bottom.append(panel('Runs', runsTable(loadRuns())), characterPanel());

    const stack = createEl('div', undefined, 'stack');
    stack.append(
      top,
      bottom,
      hint('Runs and stats are kept in this browser, from games you have finished.'),
    );
    return stack;
  }

  function attachmentsPanel(): HTMLElement {
    const stack = createEl('div', undefined, 'stack');
    const groups = createEl('div', undefined, 'split split-2');
    for (const group of ATTACHMENTS) {
      groups.append(
        panel(
          group.name,
          options(group.options, settings.attachments[group.id] ?? '', (id) => {
            settings.attachments[group.id] = id;
            render();
          }),
        ),
      );
    }
    stack.append(
      groups,
      hint(
        'Attachments are not in the game yet. A pick here is remembered and never used in a game.',
      ),
    );
    return stack;
  }

  function loadoutPage(): HTMLElement {
    const slots = panel(
      'Loadout slots',
      options(LOADOUTS, settings.loadout, (id) => {
        set('loadout', id);
      }),
      hint('Every slot holds the M1911 for now. Picking another slot changes nothing in a game.'),
    );

    const weapon = panel(
      'Weapon',
      options(WEAPONS, settings.weapon, (id) => {
        set('weapon', id);
      }),
      hint('The M1911 is the only weapon in the game.'),
    );

    const customise = createEl('div', undefined, 'stack');
    customise.append(weapon, attachmentsPanel());

    const page = createEl('div', undefined, 'split split-loadout');
    page.append(slots, customise);
    return page;
  }

  function skinsPage(): HTMLElement {
    const stack = createEl('div', undefined, 'stack');
    const groups = createEl('div', undefined, 'split split-skins');
    for (const group of SKINS) {
      groups.append(
        panel(
          group.name,
          options(group.options, settings.skins[group.id] ?? '', (id) => {
            settings.skins[group.id] = id;
            render();
          }),
        ),
      );
    }
    stack.append(
      groups,
      hint('Skins are not in the game yet. A pick here is remembered and never used in a game.'),
    );
    return stack;
  }

  function playPage(): HTMLElement {
    const map = MAPS.find((choice) => choice.id === settings.map);
    const mode = MODES.find((choice) => choice.id === settings.mode);
    // Only what the game has can be started, so a placeholder map cannot be played.
    const ready = map?.available === true && mode?.available === true;

    const start = createEl('button', 'Start', 'start-button');
    start.type = 'button';
    start.disabled = !ready;
    start.addEventListener('click', () => {
      actions.start();
    });

    const picks = createEl('div', undefined, 'split split-2');
    picks.append(
      panel(
        'Map',
        options(MAPS, settings.map, (id) => {
          set('map', id);
        }),
      ),
      panel(
        'Game mode',
        options(MODES, settings.mode, (id) => {
          set('mode', id);
        }),
      ),
    );

    const startPanel = panel(
      'Start',
      createEl('p', `${map?.name ?? ''}, ${mode?.name ?? ''}`, 'summary'),
      start,
      hint(
        ready ? 'Esc pauses and brings you back here.' : 'That map or mode is not in the game yet.',
      ),
    );

    const stack = createEl('div', undefined, 'stack');
    stack.append(picks, startPanel, panel('Controls', createControls()));
    return stack;
  }

  const PAGES: Record<SectionId, () => HTMLElement> = {
    profile: profilePage,
    loadout: loadoutPage,
    skins: skinsPage,
    play: playPage,
  };

  /** Navigation is built from the section list, so a new section needs no layout change. */
  function navigation(): HTMLElement {
    const nav = createEl('nav', undefined, 'menu-nav');
    for (const [id, label] of Object.entries(MENU_SECTIONS)) {
      const button = createEl('button', label, 'nav-button');
      button.type = 'button';
      button.dataset.section = id;
      if (id === settings.section) button.classList.add('selected');
      button.addEventListener('click', () => {
        set('section', id as SectionId);
      });
      nav.append(button);
    }
    nameLabel = createEl('span', nameText(), 'menu-name');
    nav.append(nameLabel);
    return nav;
  }

  function render() {
    const body = createEl('div', undefined, 'menu-body');
    body.append(PAGES[settings.section]());
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    root.replaceChildren(navigation(), body);
  }

  return {
    /** Show the menu, picking up any run recorded since it was last open. */
    open() {
      render();
      root.hidden = false;
    },

    close() {
      root.hidden = true;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },

    isOpen: () => !root.hidden,

    /** Record a finished run so the Profile section can show it. */
    recordRun(run: Run) {
      addRun(run);
    },
  };
}
