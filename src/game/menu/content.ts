/**
 * Everything the menu lists. Adding a section, loadout slot, attachment slot, skin,
 * map or mode is an entry here, not a change to the menu's layout.
 *
 * `available: false` marks something the game does not have yet. The menu shows it
 * in place and labels it, but it cannot be picked.
 */

import { WEAPON } from '../../core/game';
import { shootHouse } from '../../core/maps/shootHouse';

/** One thing that can be picked. */
export interface Choice {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  /** A line under the name, for anything that needs one. */
  readonly detail?: string;
}

/** Attachment and skin groups: a heading with options under it. */
export interface ChoiceGroup {
  readonly id: string;
  readonly name: string;
  readonly options: readonly Choice[];
}

/** Section names double as the navigation order. */
export const MENU_SECTIONS = {
  profile: 'Profile',
  loadout: 'Loadout',
  skins: 'Skins',
  play: 'Maps and game modes',
} as const;

export type SectionId = keyof typeof MENU_SECTIONS;

/** Slot 1 carries the one weapon the game has. The rest hold nothing yet. */
function loadoutSlot(number: number): Choice {
  return {
    id: `loadout-${number}`,
    name: `Loadout ${number}`,
    available: true,
    detail: number === 1 ? WEAPON.name : 'Empty',
  };
}

export const DEFAULT_LOADOUT = loadoutSlot(1);

export const LOADOUTS: readonly Choice[] = [
  DEFAULT_LOADOUT,
  loadoutSlot(2),
  loadoutSlot(3),
  loadoutSlot(4),
  loadoutSlot(5),
];

export const WEAPONS: readonly Choice[] = [
  { id: 'm1911', name: WEAPON.name, available: true },
  { id: 'ak-47', name: 'AK-47', available: false },
  { id: 'mp5', name: 'MP5', available: false },
  { id: 'remington-870', name: 'Remington 870', available: false },
];

export const ATTACHMENTS: readonly ChoiceGroup[] = [
  {
    id: 'sight',
    name: 'Sight',
    options: [
      { id: 'iron-sights', name: 'Iron sights', available: false },
      { id: 'red-dot', name: 'Red dot sight', available: false },
      { id: 'holographic', name: 'Holographic sight', available: false },
      { id: 'scope-4x', name: '4x scope', available: false },
    ],
  },
  {
    id: 'muzzle',
    name: 'Muzzle',
    options: [
      { id: 'no-muzzle', name: 'Nothing fitted', available: false },
      { id: 'suppressor', name: 'Suppressor', available: false },
      { id: 'compensator', name: 'Compensator', available: false },
      { id: 'muzzle-brake', name: 'Muzzle brake', available: false },
    ],
  },
  {
    id: 'grip',
    name: 'Grip',
    options: [
      { id: 'no-grip', name: 'Nothing fitted', available: false },
      { id: 'vertical-grip', name: 'Vertical grip', available: false },
      { id: 'angled-grip', name: 'Angled grip', available: false },
    ],
  },
  {
    id: 'magazine',
    name: 'Magazine',
    options: [
      { id: 'magazine-7', name: '7-round magazine', available: false },
      { id: 'magazine-10', name: '10-round magazine', available: false },
    ],
  },
];

export const SKINS: readonly ChoiceGroup[] = [
  {
    id: 'weapon',
    name: 'Weapon',
    options: [
      { id: 'black-oxide', name: 'Black oxide', available: false },
      { id: 'parkerized', name: 'Parkerized', available: false },
      { id: 'stainless', name: 'Stainless', available: false },
      { id: 'flat-dark-earth', name: 'Flat dark earth', available: false },
    ],
  },
  {
    id: 'gloves',
    name: 'Gloves',
    options: [
      { id: 'leather-gloves', name: 'Leather gloves', available: false },
      { id: 'flight-gloves', name: 'Flight gloves', available: false },
      { id: 'canvas-gloves', name: 'Canvas work gloves', available: false },
    ],
  },
  {
    id: 'sleeves',
    name: 'Sleeves',
    options: [
      { id: 'short-sleeves', name: 'Short sleeves', available: false },
      { id: 'rolled-sleeves', name: 'Rolled sleeves', available: false },
      { id: 'field-jacket', name: 'Field jacket', available: false },
    ],
  },
];

export const SHOOT_HOUSE: Choice = { id: 'shoot-house', name: shootHouse.name, available: true };

export const MAPS: readonly Choice[] = [
  SHOOT_HOUSE,
  { id: 'warehouse', name: 'Warehouse', available: false },
  { id: 'train-yard', name: 'Train Yard', available: false },
];

/** The one way to play in the game so far. */
export const TARGET_PRACTICE: Choice = {
  id: 'target-practice',
  name: 'Target practice',
  available: true,
  detail: `Knock down all ${shootHouse.targets.length} targets.`,
};

export const MODES: readonly Choice[] = [
  TARGET_PRACTICE,
  { id: 'timed-run', name: 'Timed run', available: false },
];

export const CONTROLS: readonly (readonly [string, string])[] = [
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
