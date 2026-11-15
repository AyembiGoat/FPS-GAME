/**
 * Weapon attachments as plain data.
 *
 * An attachment is a record of multipliers. `effectiveWeaponSpec` in `weapon.ts` folds the
 * equipped records into the weapon's numbers before the simulation ever sees them, so
 * `stepWeapon` has no attachment-specific branches. The percentages are game balance; the
 * parts themselves are real accessory types.
 */

import type { WeaponCategory } from './weapon';

export type AttachmentSlot = 'muzzle' | 'grip' | 'magazine' | 'buttstock';

export type AttachmentId =
  | 'compensator'
  | 'muzzle-brake'
  | 'flash-hider'
  | 'suppressor'
  | 'choke'
  | 'vertical-foregrip'
  | 'angled-foregrip'
  | 'extended-mag'
  | 'quickdraw-mag'
  | 'extended-quickdraw-mag'
  | 'cheek-pad'
  | 'lightweight-stock';

/** Multipliers applied to the matching weapon number. A missing entry means "unchanged". */
export interface AttachmentModifiers {
  /** Vertical kick per shot. */
  readonly recoilVertical?: number;
  /** Sideways kick per shot. */
  readonly recoilHorizontal?: number;
  /** Rate at which the muzzle settles. */
  readonly recoilRecovery?: number;
  /** Kick while fully aimed down the sights. */
  readonly aimedRecoil?: number;
  /** Seconds to bring the sights up. */
  readonly aimTime?: number;
  /** Rounds in the magazine (rounded to a whole round). */
  readonly magazineSize?: number;
  /** Seconds to reload. */
  readonly reloadTime?: number;
  /** Shot pattern width. */
  readonly pelletSpread?: number;
  /** Distance at which the shot alerts combatants. */
  readonly noiseRadius?: number;
  /** Visible muzzle flash; 0 hides it. */
  readonly muzzleFlash?: number;
  /** Damage kept at long range. */
  readonly longRangeDamage?: number;
}

export interface AttachmentSpec {
  readonly id: AttachmentId;
  readonly name: string;
  readonly shortName: string;
  readonly slot: AttachmentSlot;
  readonly description: string;
  readonly modifiers: AttachmentModifiers;
  /** Weapon categories the part fits. The weapon must also have the slot. */
  readonly compatibility: readonly WeaponCategory[];
  /** True when the report is quieter and duller. */
  readonly suppressesSound: boolean;
}

export const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = [
  'muzzle',
  'grip',
  'magazine',
  'buttstock',
];

export const ATTACHMENT_SLOT_LABEL: Readonly<Record<AttachmentSlot, string>> = {
  muzzle: 'Muzzle',
  grip: 'Grip',
  magazine: 'Magazine',
  buttstock: 'Stock',
};

export const ATTACHMENTS: Readonly<Record<AttachmentId, AttachmentSpec>> = {
  compensator: {
    id: 'compensator',
    name: 'Compensator',
    shortName: 'Comp',
    slot: 'muzzle',
    description: 'Ports vent gas upward to hold the muzzle down. Vertical kick −18%.',
    modifiers: { recoilVertical: 0.82 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper'],
    suppressesSound: false,
  },
  'muzzle-brake': {
    id: 'muzzle-brake',
    name: 'Muzzle Brake',
    shortName: 'Brake',
    slot: 'muzzle',
    description: 'Side ports steady the rifle. Sideways kick −30%, vertical kick −10%.',
    modifiers: { recoilHorizontal: 0.7, recoilVertical: 0.9 },
    compatibility: ['assault', 'dmr', 'sniper'],
    suppressesSound: false,
  },
  'flash-hider': {
    id: 'flash-hider',
    name: 'Flash Hider',
    shortName: 'Flash Hider',
    slot: 'muzzle',
    description: 'Pronged cage disperses burning gas. No muzzle flash, recoil settles 5% faster.',
    modifiers: { muzzleFlash: 0, recoilRecovery: 1.05 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper'],
    suppressesSound: false,
  },
  suppressor: {
    id: 'suppressor',
    name: 'Suppressor',
    shortName: 'Suppressor',
    slot: 'muzzle',
    description:
      'Baffle stack quiets the report. Heard at half the distance, far less flash, slightly less damage at long range, vertical kick +4%.',
    modifiers: { noiseRadius: 0.5, muzzleFlash: 0.15, longRangeDamage: 0.94, recoilVertical: 1.04 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper', 'pistol'],
    suppressesSound: true,
  },
  choke: {
    id: 'choke',
    name: 'Full Choke',
    shortName: 'Choke',
    slot: 'muzzle',
    description: 'Constricted bore keeps the shot column together. Pattern 25% tighter.',
    modifiers: { pelletSpread: 0.75 },
    compatibility: ['shotgun'],
    suppressesSound: false,
  },
  'vertical-foregrip': {
    id: 'vertical-foregrip',
    name: 'Vertical Foregrip',
    shortName: 'Vertical Grip',
    slot: 'grip',
    description: 'Upright rail grip for a firm support hand. Recoil settles 20% faster.',
    modifiers: { recoilRecovery: 1.2 },
    compatibility: ['assault', 'smg'],
    suppressesSound: false,
  },
  'angled-foregrip': {
    id: 'angled-foregrip',
    name: 'Angled Foregrip',
    shortName: 'Angled Grip',
    slot: 'grip',
    description: 'Raked rail grip for a faster mount. Aim time −15%, recoil settles 5% faster.',
    modifiers: { aimTime: 0.85, recoilRecovery: 1.05 },
    compatibility: ['assault', 'smg'],
    suppressesSound: false,
  },
  'extended-mag': {
    id: 'extended-mag',
    name: 'Extended Magazine',
    shortName: 'Extended Mag',
    slot: 'magazine',
    description: 'Longer magazine body. Capacity +50%.',
    modifiers: { magazineSize: 1.5 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper', 'shotgun', 'pistol'],
    suppressesSound: false,
  },
  'quickdraw-mag': {
    id: 'quickdraw-mag',
    name: 'Quickdraw Magazine',
    shortName: 'Quickdraw Mag',
    slot: 'magazine',
    description: 'Pull loop on the base plate speeds the change. Reload time −30%.',
    modifiers: { reloadTime: 0.7 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper', 'shotgun', 'pistol'],
    suppressesSound: false,
  },
  'extended-quickdraw-mag': {
    id: 'extended-quickdraw-mag',
    name: 'Extended Quickdraw Magazine',
    shortName: 'Ext. Quickdraw',
    slot: 'magazine',
    description: 'Half of each. Capacity +25%, reload time −15%.',
    modifiers: { magazineSize: 1.25, reloadTime: 0.85 },
    compatibility: ['assault', 'smg', 'dmr', 'sniper', 'shotgun', 'pistol'],
    suppressesSound: false,
  },
  'cheek-pad': {
    id: 'cheek-pad',
    name: 'Cheek Pad',
    shortName: 'Cheek Pad',
    slot: 'buttstock',
    description: 'Raised comb locks the head behind the sight. Kick while aimed −40%.',
    modifiers: { aimedRecoil: 0.6 },
    compatibility: ['dmr', 'sniper'],
    suppressesSound: false,
  },
  'lightweight-stock': {
    id: 'lightweight-stock',
    name: 'Lightweight Stock',
    shortName: 'Light Stock',
    slot: 'buttstock',
    description: 'Skeletonised stock shoulders faster. Aim time −20%.',
    modifiers: { aimTime: 0.8 },
    compatibility: ['dmr', 'sniper'],
    suppressesSound: false,
  },
};

export const ATTACHMENT_LIST: readonly AttachmentSpec[] = [
  ATTACHMENTS.compensator,
  ATTACHMENTS['muzzle-brake'],
  ATTACHMENTS['flash-hider'],
  ATTACHMENTS.suppressor,
  ATTACHMENTS.choke,
  ATTACHMENTS['vertical-foregrip'],
  ATTACHMENTS['angled-foregrip'],
  ATTACHMENTS['extended-mag'],
  ATTACHMENTS['quickdraw-mag'],
  ATTACHMENTS['extended-quickdraw-mag'],
  ATTACHMENTS['cheek-pad'],
  ATTACHMENTS['lightweight-stock'],
];

/** The parts fitted to one weapon: at most one per slot. */
export type WeaponAttachments = Readonly<Partial<Record<AttachmentSlot, AttachmentId>>>;

export const NO_ATTACHMENTS: WeaponAttachments = {};

export function isAttachmentId(value: unknown): value is AttachmentId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ATTACHMENTS, value);
}

export function getAttachmentSpec(id: AttachmentId): AttachmentSpec {
  return ATTACHMENTS[id];
}

/** What the compatibility check needs to know about a weapon. */
export interface AttachmentHost {
  readonly name: string;
  readonly category: WeaponCategory;
  readonly attachmentSlots: readonly AttachmentSlot[];
}

const CATEGORY_PLURAL: Readonly<Record<WeaponCategory, string>> = {
  assault: 'assault rifles',
  smg: 'submachine guns',
  shotgun: 'shotguns',
  sniper: 'sniper rifles',
  dmr: 'marksman rifles',
  lmg: 'machine guns',
  pistol: 'pistols',
};

const SLOT_MISSING_REASON: Readonly<Record<AttachmentSlot, string>> = {
  muzzle: 'has no threaded muzzle',
  grip: 'has no rail under the barrel',
  magazine: 'has a fixed magazine',
  buttstock: 'has a fixed stock',
};

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export type AttachmentFit =
  { readonly fits: true } | { readonly fits: false; readonly reason: string };

/** Whether a part can go on a weapon, with a plain reason when it cannot. */
export function attachmentFit(host: AttachmentHost, attachment: AttachmentSpec): AttachmentFit {
  if (!host.attachmentSlots.includes(attachment.slot)) {
    return { fits: false, reason: `${host.name} ${SLOT_MISSING_REASON[attachment.slot]}` };
  }
  if (!attachment.compatibility.includes(host.category)) {
    const fitsOn = joinWords(attachment.compatibility.map((category) => CATEGORY_PLURAL[category]));
    return { fits: false, reason: `Fits ${fitsOn} only` };
  }
  return { fits: true };
}

/** Drop anything that does not fit the weapon, is unknown, or sits in the wrong slot. */
export function sanitizeAttachments(host: AttachmentHost, candidate: unknown): WeaponAttachments {
  if (typeof candidate !== 'object' || candidate === null) return NO_ATTACHMENTS;
  const source = candidate as Partial<Record<AttachmentSlot, unknown>>;
  const result: Partial<Record<AttachmentSlot, AttachmentId>> = {};
  for (const slot of ATTACHMENT_SLOTS) {
    const id = source[slot];
    if (!isAttachmentId(id)) continue;
    const spec = ATTACHMENTS[id];
    if (spec.slot !== slot) continue;
    if (!attachmentFit(host, spec).fits) continue;
    result[slot] = id;
  }
  return result;
}

/** Every multiplier, with 1 meaning "unchanged". */
export type ResolvedAttachmentModifiers = Readonly<Required<AttachmentModifiers>>;

export const NEUTRAL_MODIFIERS: ResolvedAttachmentModifiers = {
  recoilVertical: 1,
  recoilHorizontal: 1,
  recoilRecovery: 1,
  aimedRecoil: 1,
  aimTime: 1,
  magazineSize: 1,
  reloadTime: 1,
  pelletSpread: 1,
  noiseRadius: 1,
  muzzleFlash: 1,
  longRangeDamage: 1,
};

/** Multiply together the modifiers of every fitted part. */
export function combineAttachmentModifiers(
  attachments: WeaponAttachments,
): ResolvedAttachmentModifiers {
  let combined: ResolvedAttachmentModifiers = NEUTRAL_MODIFIERS;
  for (const slot of ATTACHMENT_SLOTS) {
    const id = attachments[slot];
    if (!id) continue;
    const m = ATTACHMENTS[id].modifiers;
    combined = {
      recoilVertical: combined.recoilVertical * (m.recoilVertical ?? 1),
      recoilHorizontal: combined.recoilHorizontal * (m.recoilHorizontal ?? 1),
      recoilRecovery: combined.recoilRecovery * (m.recoilRecovery ?? 1),
      aimedRecoil: combined.aimedRecoil * (m.aimedRecoil ?? 1),
      aimTime: combined.aimTime * (m.aimTime ?? 1),
      magazineSize: combined.magazineSize * (m.magazineSize ?? 1),
      reloadTime: combined.reloadTime * (m.reloadTime ?? 1),
      pelletSpread: combined.pelletSpread * (m.pelletSpread ?? 1),
      noiseRadius: combined.noiseRadius * (m.noiseRadius ?? 1),
      muzzleFlash: combined.muzzleFlash * (m.muzzleFlash ?? 1),
      longRangeDamage: combined.longRangeDamage * (m.longRangeDamage ?? 1),
    };
  }
  return combined;
}

/** True when any fitted part quiets the report. */
export function attachmentsSuppressSound(attachments: WeaponAttachments): boolean {
  for (const slot of ATTACHMENT_SLOTS) {
    const id = attachments[slot];
    if (id && ATTACHMENTS[id].suppressesSound) return true;
  }
  return false;
}

/** Short names of the fitted parts in slot order, for a one-line summary. */
export function attachmentSummary(attachments: WeaponAttachments): string[] {
  const names: string[] = [];
  for (const slot of ATTACHMENT_SLOTS) {
    const id = attachments[slot];
    if (id) names.push(ATTACHMENTS[id].shortName);
  }
  return names;
}
