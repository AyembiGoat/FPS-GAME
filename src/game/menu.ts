import {
  ATTACHMENTS,
  ATTACHMENT_SLOTS,
  CHARACTERS,
  LOADOUT_SLOTS,
  MAPS,
  MODES,
  SECTIONS,
  SKINS,
  WEAPONS,
} from './menu/data';
import {
  computeStats,
  loadName,
  loadRuns,
  loadSelections,
  saveName,
  saveSelections,
} from './menu/state';
import type { LoadoutSelection, RunRecord, Selections } from './menu/state';
import {
  box,
  button,
  choice,
  element,
  formatDate,
  formatTime,
  heading,
  note,
  pairs,
  pendingNote,
} from './menu/ui';

const CONTROLS: readonly (readonly [string, string])[] = [
  ['Move', 'W A S D'],
  ['Look', 'Mouse'],
  ['Fire', 'Left click'],
  ['Aim', 'Right click (hold)'],
  ['Lean', 'Q and E (hold)'],
  ['Reload', 'R'],
  ['Jump', 'Space'],
  ['Sprint', 'Left Shift'],
  ['Pause', 'Esc'],
];

/** What each section draws. Adding a section is one entry in data.ts plus one here. */
const SECTION_RENDERERS: Readonly<
  Record<string, (content: HTMLElement, menu: MenuInternals) => void>
> = {
  profile: renderProfile,
  loadout: renderLoadout,
  skins: renderSkins,
  maps: renderMaps,
};

interface MenuInternals {
  readonly selections: Selections;
  readonly runs: readonly RunRecord[];
  readonly name: string | null;
  update(selections: Selections): void;
  setName(name: string): void;
  start(): void;
}

function loadoutOf(selections: Selections): LoadoutSelection {
  return (
    selections.loadouts[selections.loadoutSlot] ?? {
      weaponId: WEAPONS[0]?.id ?? 'm1911',
      attachments: {},
    }
  );
}

function renderProfile(content: HTMLElement, menu: MenuInternals): void {
  const nameBox = box('Name');
  const current = element('p', menu.name === null ? 'No name set' : `Name: ${menu.name}`);
  current.className = 'menu-value';
  const input = element('input');
  input.type = 'text';
  input.placeholder = 'Enter a name';
  input.maxLength = 20;
  input.value = menu.name ?? '';
  input.setAttribute('aria-label', 'Player name');
  const message = element('span');
  message.className = 'menu-note';
  const save = element('button', 'Save name');
  save.type = 'button';
  save.className = 'menu-button';
  save.addEventListener('click', () => {
    const value = input.value.trim();
    if (value === '') {
      message.textContent = 'Enter a name first';
      return;
    }
    menu.setName(value);
    current.textContent = `Name: ${value}`;
    message.textContent = 'Saved in this browser';
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save.click();
  });
  const row = element('div');
  row.className = 'menu-row';
  row.append(input, save, message);
  nameBox.body.append(current, row);
  content.append(nameBox.box);

  const stats = computeStats(menu.runs);
  const statsBox = box('Player');
  statsBox.body.append(
    pairs([
      ['Runs played', String(stats.runsPlayed)],
      ['Best time', stats.bestTime === null ? 'No runs yet' : formatTime(stats.bestTime)],
      ['Shots fired', String(stats.shotsFired)],
      [
        'Accuracy',
        stats.accuracy === null ? 'No runs yet' : `${Math.round(stats.accuracy * 100)}%`,
      ],
    ]),
    note('Counted from the runs listed below. Nothing here is estimated.'),
  );
  content.append(statsBox.box);

  const runsBox = box('Runs');
  if (menu.runs.length === 0) {
    runsBox.body.append(element('p', 'No runs yet'));
    runsBox.body.append(
      note('A run is recorded when you knock down all ten targets in Shoot House.'),
    );
  } else {
    const table = element('table');
    const head = element('tr');
    for (const label of ['Map', 'Mode', 'Time', 'Targets hit', 'Date']) {
      head.append(element('th', label));
    }
    table.append(head);
    for (const run of [...menu.runs].reverse()) {
      const row = element('tr');
      row.append(
        element('td', run.map),
        element('td', run.mode),
        element('td', formatTime(run.time)),
        element('td', String(run.targetsHit)),
        element('td', formatDate(run.date)),
      );
      table.append(row);
    }
    runsBox.body.append(table);
  }
  content.append(runsBox.box);

  const characterBox = box('Character');
  const shown = CHARACTERS.find((option) => option.id === menu.selections.characterId);
  const display = element('div', shown?.name ?? 'No character selected');
  display.className = 'menu-display';
  characterBox.body.append(pendingNote('Characters do not appear in the game yet.'), display);
  characterBox.body.append(
    choice(
      'Choose a character',
      CHARACTERS.map((option) => ({
        id: option.id,
        label: option.name,
        selected: option.id === menu.selections.characterId,
      })),
      (id) => {
        menu.update({ ...menu.selections, characterId: id });
      },
    ),
  );
  content.append(characterBox.box);
}

function renderLoadout(content: HTMLElement, menu: MenuInternals): void {
  const slotsBox = box('Loadout slots');
  slotsBox.body.append(
    choice(
      'Which loadout you are editing',
      LOADOUT_SLOTS.map((slot) => ({
        id: slot.id,
        label: slot.label,
        selected: slot.id === menu.selections.loadoutSlot,
      })),
      (id) => {
        menu.update({ ...menu.selections, loadoutSlot: id });
      },
    ),
  );
  content.append(slotsBox.box);

  const loadout = loadoutOf(menu.selections);

  const weaponBox = box('Weapon');
  weaponBox.body.append(
    pendingNote('Only the M1911 is in the game. Choosing another weapon does not change it.'),
  );
  weaponBox.body.append(
    choice(
      'Weapon for this loadout',
      WEAPONS.map((weapon) => ({
        id: weapon.id,
        label: weapon.inGame
          ? `${weapon.name} — in the game`
          : `${weapon.name} — not in the game yet`,
        selected: weapon.id === loadout.weaponId,
      })),
      (id) => {
        const loadouts = { ...menu.selections.loadouts };
        loadouts[menu.selections.loadoutSlot] = { ...loadout, weaponId: id };
        menu.update({ ...menu.selections, loadouts });
      },
    ),
  );
  content.append(weaponBox.box);

  const attachmentsBox = box('Attachments');
  attachmentsBox.body.append(
    pendingNote('Attachments are not in the game yet. Choices here are remembered only.'),
  );
  for (const slot of ATTACHMENT_SLOTS) {
    const options = ATTACHMENTS[slot.id] ?? [];
    attachmentsBox.body.append(
      choice(
        slot.label,
        options.map((option) => ({
          id: option.id,
          label: option.name,
          selected: option.id === loadout.attachments[slot.id],
        })),
        (optionId) => {
          const loadouts = { ...menu.selections.loadouts };
          loadouts[menu.selections.loadoutSlot] = {
            ...loadout,
            attachments: { ...loadout.attachments, [slot.id]: optionId },
          };
          menu.update({ ...menu.selections, loadouts });
        },
      ),
    );
  }
  content.append(attachmentsBox.box);
}

function renderSkins(content: HTMLElement, menu: MenuInternals): void {
  content.append(pendingNote('Skins are not in the game yet. Choices here are remembered only.'));
  for (const group of SKINS) {
    const groupBox = box(group.label);
    groupBox.body.append(
      choice(
        'Select one',
        group.options.map((option) => ({
          id: option.id,
          label: option.name,
          selected: option.id === menu.selections.skins[group.id],
        })),
        (id) => {
          menu.update({ ...menu.selections, skins: { ...menu.selections.skins, [group.id]: id } });
        },
      ),
    );
    content.append(groupBox.box);
  }
}

function renderMaps(content: HTMLElement, menu: MenuInternals): void {
  const mapBox = box('Map');
  mapBox.body.append(
    choice(
      'Where to play',
      MAPS.map((map) => ({
        id: map.id,
        label: map.inGame ? `${map.name} — in the game` : `${map.name} — not in the game yet`,
        selected: map.id === menu.selections.mapId,
      })),
      (id) => {
        menu.update({ ...menu.selections, mapId: id });
      },
    ),
  );
  content.append(mapBox.box);

  const modeBox = box('Game mode');
  modeBox.body.append(
    choice(
      'How to play',
      MODES.map((mode) => ({
        id: mode.id,
        label: mode.inGame ? `${mode.name} — in the game` : `${mode.name} — not in the game yet`,
        selected: mode.id === menu.selections.modeId,
      })),
      (id) => {
        menu.update({ ...menu.selections, modeId: id });
      },
    ),
  );
  content.append(modeBox.box);

  const chosenMap = MAPS.find((map) => map.id === menu.selections.mapId);
  const chosenMode = MODES.find((mode) => mode.id === menu.selections.modeId);
  const ready = chosenMap?.inGame === true && chosenMode?.inGame === true;

  const startBox = box('Start');
  const summary = element('p', `${chosenMap?.name ?? 'No map'} — ${chosenMode?.name ?? 'No mode'}`);
  summary.className = 'menu-value';
  const start = element('button', 'Start game');
  start.type = 'button';
  start.className = 'menu-button menu-start';
  start.disabled = !ready;
  start.addEventListener('click', () => {
    menu.start();
  });
  startBox.body.append(summary, start);
  startBox.body.append(
    note(
      ready
        ? 'Starts Shoot House with the M1911. Esc pauses; Main menu goes back to the menu.'
        : 'Only Shoot House with all targets is in the game. Pick that to start.',
    ),
  );
  content.append(startBox.box);

  const controlsBox = box('Controls');
  controlsBox.body.append(pairs(CONTROLS));
  content.append(controlsBox.box);
}

export function createMenu(menuElement: HTMLElement, onStart: () => void) {
  const nav = menuElement.querySelector<HTMLElement>('#menu-nav');
  const contentElement = menuElement.querySelector<HTMLElement>('#menu-content');
  if (!nav || !contentElement) throw new Error('Missing menu containers in index.html');
  const navList = nav;
  const contentBox = contentElement;

  let currentSection = SECTIONS[0]?.id ?? 'profile';
  let name = loadName();
  let runs = loadRuns();
  let selections = loadSelections();

  const internals: MenuInternals = {
    get selections() {
      return selections;
    },
    get runs() {
      return runs;
    },
    get name() {
      return name;
    },
    update(next) {
      selections = next;
      saveSelections(next);
      render();
    },
    setName(next) {
      name = next;
      saveName(next);
      renderNav();
    },
    start: onStart,
  };

  function renderNav(): void {
    navList.replaceChildren();
    const title = element('p', 'Main menu');
    title.className = 'menu-title';
    navList.append(title);
    for (const section of SECTIONS) {
      const id = section.id;
      const item = button(section.label, id === currentSection, () => {
        currentSection = id;
        renderNav();
        renderContent();
        contentBox.scrollTo({ top: 0 });
      });
      item.className = item.className.replace('menu-button', 'menu-nav-item');
      navList.append(item);
    }
    const who = element('p', name === null ? 'No name set' : name);
    who.className = 'menu-who';
    navList.append(who);
  }

  function renderContent(): void {
    contentBox.replaceChildren();
    const section = SECTIONS.find((entry) => entry.id === currentSection);
    contentBox.append(heading(2, section?.label ?? 'Menu'));
    const renderSection = SECTION_RENDERERS[currentSection];
    if (renderSection) renderSection(contentBox, internals);
    else contentBox.append(note('This section has not been built yet.'));
  }

  function render(): void {
    renderNav();
    renderContent();
  }

  function refresh(): void {
    name = loadName();
    runs = loadRuns();
    selections = loadSelections();
    render();
  }

  render();

  return {
    show() {
      menuElement.hidden = false;
      refresh();
    },
    hide() {
      menuElement.hidden = true;
    },
    refresh,
  };
}
