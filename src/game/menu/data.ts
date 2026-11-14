/**
 * Menu content, as plain data. Adding an entry later is a one-line change here.
 * `inGame` marks the entries that exist in the game today. Everything else is
 * shown in its place but marked "not in the game yet" and changes nothing.
 */

export interface MenuSection {
  readonly id: string;
  readonly label: string;
}

export const SECTIONS: readonly MenuSection[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'loadout', label: 'Loadout' },
  { id: 'skins', label: 'Skins' },
  { id: 'maps', label: 'Maps' },
] as const;

export interface LoadoutSlot {
  readonly id: string;
  readonly label: string;
}

export const LOADOUT_SLOTS: readonly LoadoutSlot[] = [
  { id: 'slot-1', label: 'Loadout 1' },
  { id: 'slot-2', label: 'Loadout 2' },
  { id: 'slot-3', label: 'Loadout 3' },
] as const;

export interface WeaponOption {
  readonly id: string;
  readonly name: string;
  readonly inGame: boolean;
}

export const WEAPONS: readonly WeaponOption[] = [
  { id: 'm1911', name: 'M1911', inGame: true },
  { id: 'ak-47', name: 'AK-47', inGame: false },
  { id: 'mp5', name: 'MP5', inGame: false },
  { id: 'remington-870', name: 'Remington 870', inGame: false },
  { id: 'glock-17', name: 'Glock 17', inGame: false },
] as const;

export interface AttachmentSlot {
  readonly id: string;
  readonly label: string;
}

export const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = [
  { id: 'sight', label: 'Sight' },
  { id: 'muzzle', label: 'Muzzle' },
  { id: 'grip', label: 'Grip' },
  { id: 'magazine', label: 'Magazine' },
] as const;

export interface AttachmentOption {
  readonly id: string;
  readonly name: string;
}

export const ATTACHMENTS: Readonly<Record<string, readonly AttachmentOption[]>> = {
  sight: [
    { id: 'none', name: 'None' },
    { id: 'iron-sights', name: 'Iron sights' },
    { id: 'red-dot', name: 'Red dot sight' },
    { id: '4x-scope', name: '4x scope' },
  ],
  muzzle: [
    { id: 'none', name: 'None' },
    { id: 'suppressor', name: 'Suppressor' },
    { id: 'compensator', name: 'Compensator' },
    { id: 'flash-hider', name: 'Flash hider' },
  ],
  grip: [
    { id: 'none', name: 'None' },
    { id: 'vertical-grip', name: 'Vertical grip' },
    { id: 'angled-grip', name: 'Angled grip' },
  ],
  magazine: [
    { id: 'standard', name: 'Standard magazine' },
    { id: 'extended', name: 'Extended magazine' },
  ],
} as const;

export interface SkinOption {
  readonly id: string;
  readonly name: string;
}

export interface SkinGroup {
  readonly id: string;
  readonly label: string;
  readonly options: readonly SkinOption[];
}

export const SKINS: readonly SkinGroup[] = [
  {
    id: 'weapon',
    label: 'Weapon skins',
    options: [
      { id: 'standard', name: 'Standard' },
      { id: 'black', name: 'Black' },
      { id: 'desert-tan', name: 'Desert tan' },
      { id: 'woodland', name: 'Woodland' },
    ],
  },
  {
    id: 'gloves',
    label: 'Gloves',
    options: [
      { id: 'standard', name: 'Standard gloves' },
      { id: 'black', name: 'Black gloves' },
      { id: 'tactical', name: 'Tactical gloves' },
    ],
  },
  {
    id: 'sleeves',
    label: 'Sleeves',
    options: [
      { id: 'standard', name: 'Standard sleeves' },
      { id: 'rolled', name: 'Rolled sleeves' },
    ],
  },
] as const;

export interface MapOption {
  readonly id: string;
  readonly name: string;
  readonly inGame: boolean;
}

export const MAPS: readonly MapOption[] = [
  { id: 'shoot-house', name: 'Shoot House', inGame: true },
  { id: 'warehouse', name: 'Warehouse', inGame: false },
  { id: 'train-yard', name: 'Train Yard', inGame: false },
] as const;

export interface ModeOption {
  readonly id: string;
  readonly name: string;
  readonly inGame: boolean;
}

export const MODES: readonly ModeOption[] = [
  { id: 'targets', name: 'Knock down all targets', inGame: true },
  { id: 'team-deathmatch', name: 'Team deathmatch', inGame: false },
  { id: 'free-for-all', name: 'Free-for-all', inGame: false },
] as const;

export interface CharacterOption {
  readonly id: string;
  readonly name: string;
}

export const CHARACTERS: readonly CharacterOption[] = [
  { id: 'standard', name: 'Standard character' },
  { id: 'tactical', name: 'Tactical character' },
] as const;
