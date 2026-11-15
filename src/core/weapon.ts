/**
 * Weapons and optical sights. Every firearm is a pure `WeaponSpec` combined with a mounted
 * `OpticSpec` and stepped deterministically through `stepWeapon`.
 */

import type { AttachmentSlot, WeaponAttachments } from './attachments';
import {
  attachmentsSuppressSound,
  combineAttachmentModifiers,
  NO_ATTACHMENTS,
  sanitizeAttachments,
} from './attachments';
import type { HitZone } from './damage';
import { ARMOUR_TUNING } from './damage';
import type { Vec3 } from './vec';
import { clamp } from './vec';

export type WeaponId =
  | 'hk416'
  | 'ak47'
  | 'scar-h'
  | 'm16a4'
  | 'aug-a3'
  | 'mp5'
  | 'ump45'
  | 'vector'
  | 'remington-870'
  | 'saiga-12'
  | 'sks'
  | 'mini-14'
  | 'awm'
  | 'kar98k'
  | 'mosin-nagant'
  | 'dp-28'
  | 'm1911'
  | 'desert-eagle'
  | 'beretta-92fs';

export type WeaponCategory = 'assault' | 'smg' | 'shotgun' | 'dmr' | 'sniper' | 'lmg' | 'pistol';
export type WeaponSlot = 'primary' | 'secondary';
/** `burst` fires `burstCount` rounds per trigger pull and cannot be re-triggered mid-burst. */
export type FireMode = 'semi' | 'auto' | 'burst' | 'pump' | 'bolt';
export type OpticId =
  'irons' | 'red-dot' | 'holo' | 'acog' | 'pso-1' | 'lpvo' | 'pm2-8x' | 'sniper-scope';
export type ScopeOverlayKind = 'none' | 'acog' | 'pso' | 'lpvo' | 'sniper';
/** Kept for compatibility and quick optics summary. */
export type ScopeStyle = 'irons' | 'holo' | 'reflex' | 'telescopic';

export interface OpticSpec {
  readonly id: OpticId;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  /**
   * Magnification stage(s). `null` means keep the weapon's own iron-sight magnification.
   * Two entries denote a variable-power scope toggled via `V` (`[2.0, 5.0]` or `[6.0, 10.0]`).
   */
  readonly zoomStages: readonly [number] | readonly [number, number] | null;
  /** Additional ADS time in seconds for heavier optical glass (0 for irons). */
  readonly aimTimeBonus: number;
  /** Overlay lens style used at full ADS (`'none'` stays purely in-world 3D glass). */
  readonly overlay: ScopeOverlayKind;
}

export const OPTICS: Readonly<Record<OpticId, OpticSpec>> = {
  irons: {
    id: 'irons',
    name: 'Iron Sights',
    shortName: 'Irons',
    description: 'Factory tritium and combat iron sights with fastest target snap.',
    zoomStages: null,
    aimTimeBonus: 0,
    overlay: 'none',
  },
  'red-dot': {
    id: 'red-dot',
    name: 'Aimpoint Micro T-2',
    shortName: 'T-2 Red Dot',
    description: 'Compact 1.35× tubular micro red dot with razor-thin bezel and 2 MOA dot.',
    zoomStages: [1.35],
    aimTimeBonus: 0.01,
    overlay: 'none',
  },
  holo: {
    id: 'holo',
    name: 'EOTech EXPS3-0',
    shortName: 'EOTech Holo',
    description: 'Wide-window 1.5× holographic sight with 65 MOA ring and 1 MOA center dot.',
    zoomStages: [1.5],
    aimTimeBonus: 0.02,
    overlay: 'none',
  },
  acog: {
    id: 'acog',
    name: 'Trijicon ACOG 3.5×',
    shortName: 'ACOG 3.5×',
    description: 'Fixed 3.5× prism combat scope with fiber-optic chevron and BDC stadia.',
    zoomStages: [3.5],
    aimTimeBonus: 0.055,
    overlay: 'acog',
  },
  'pso-1': {
    id: 'pso-1',
    name: 'PSO-1 4×24',
    shortName: 'PSO-1 4×',
    description:
      'Soviet fixed 4× side-rail scope with chevron reticle and stadiametric rangefinder.',
    zoomStages: [4.0],
    aimTimeBonus: 0.06,
    overlay: 'pso',
  },
  lpvo: {
    id: 'lpvo',
    name: 'Razor HD 2–5× LPVO',
    shortName: 'LPVO 2–5×',
    description:
      'Variable 2× / 5× Low-Power Variable Optic with illuminated horseshoe reticle (press V to toggle).',
    zoomStages: [2.0, 5.0],
    aimTimeBonus: 0.075,
    overlay: 'lpvo',
  },
  'pm2-8x': {
    id: 'pm2-8x',
    name: 'PM II 3–12×50 at 8×',
    shortName: 'PM II 8×',
    description: 'Schmidt & Bender PM II 3–12×50 held at a fixed 8× with a Mil-Dot reticle.',
    zoomStages: [8.0],
    aimTimeBonus: 0.09,
    overlay: 'sniper',
  },
  'sniper-scope': {
    id: 'sniper-scope',
    name: 'PM II 6–10× FFP',
    shortName: 'PM II 6–10×',
    description:
      'Long-range variable 6× / 10× first-focal-plane Mil-Dot telescopic scope (press V to toggle).',
    zoomStages: [6.0, 10.0],
    aimTimeBonus: 0.1,
    overlay: 'sniper',
  },
};

export const OPTIC_LIST: readonly OpticSpec[] = [
  OPTICS.irons,
  OPTICS['red-dot'],
  OPTICS.holo,
  OPTICS.acog,
  OPTICS['pso-1'],
  OPTICS.lpvo,
  OPTICS['pm2-8x'],
  OPTICS['sniper-scope'],
];

export function isOpticId(value: unknown): value is OpticId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OPTICS, value);
}

export function getOpticSpec(id: OpticId): OpticSpec {
  return OPTICS[id];
}

export interface WeaponSpec {
  readonly id: WeaponId;
  readonly name: string;
  readonly category: WeaponCategory;
  readonly slot: WeaponSlot;
  readonly caliber: string;
  readonly fireMode: FireMode;
  readonly scopeStyle: ScopeStyle;
  readonly defaultOptic: OpticId;
  readonly compatibleOptics: readonly OpticId[];
  readonly magazineSize: number;
  /** Minimum seconds between shots (between bursts for `burst` weapons). */
  readonly fireInterval: number;
  /** Rounds fired per trigger pull: 1 for everything except `burst` weapons. */
  readonly burstCount: number;
  /** Seconds between the rounds inside one burst (0 when `burstCount` is 1). */
  readonly burstInterval: number;
  readonly reloadTime: number;
  /** Metres a round travels. */
  readonly range: number;
  /** Radians the muzzle climbs per shot. */
  readonly recoilKick: number;
  /** Peak radians the muzzle is pushed sideways per shot; the direction follows a fixed pattern. */
  readonly recoilHorizontal: number;
  /** Per-second rate at which the muzzle settles back. Higher is faster. */
  readonly recoilRecovery: number;
  /** Base seconds to bring iron sights up (optic aimTimeBonus stacks on top). */
  readonly aimTime: number;
  /** Iron-sight magnification (replaced by mounted optic's zoom when an optic is equipped). */
  readonly aimZoom: number;
  /** Recoil multiplier when fully aimed. Below 1 rewards aiming. */
  readonly aimRecoilFactor: number;
  /** Number of projectiles per trigger pull (1 for rifles/pistols, 8 for buckshot). */
  readonly pellets: number;
  /**Cone half-angle in radians for multi-pellet buckshot at hipfire (0 for single-projectile). */
  readonly pelletSpread: number;
  /** Spread multiplier while aimed down sights. */
  readonly aimSpreadFactor: number;
  /** Seconds to draw and ready the weapon after switching slots. */
  readonly equipTime: number;
  /** Base torso damage per projectile (per pellet for shotguns) within `falloffStart`. */
  readonly damage: number;
  /** Multiplier applied on head hits (`1.5`..`2.0`). */
  readonly headshotMultiplier: number;
  /** Distance in metres where damage falloff begins. */
  readonly falloffStart: number;
  /** Distance in metres where damage reaches `minDamageScale`. */
  readonly falloffEnd: number;
  /** Minimum damage multiplier at and beyond `falloffEnd`. */
  readonly minDamageScale: number;
  /** Share (0..1) of a vest's or helmet's protection this round ignores. */
  readonly armourPiercing: number;
  /** Attachment slots the firearm physically has. */
  readonly attachmentSlots: readonly AttachmentSlot[];
}

export const HK416: WeaponSpec = {
  id: 'hk416',
  name: 'HK416',
  category: 'assault',
  slot: 'primary',
  caliber: '5.56×45mm',
  fireMode: 'auto',
  scopeStyle: 'holo',
  defaultOptic: 'holo',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 30,
  fireInterval: 0.071,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.25,
  range: 200,
  recoilKick: 0.017,
  recoilHorizontal: 0.005,
  recoilRecovery: 12.5,
  aimTime: 0.2,
  aimZoom: 1.5,
  aimRecoilFactor: 0.62,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.34,
  damage: 39,
  headshotMultiplier: 1.85,
  falloffStart: 28,
  falloffEnd: 75,
  minDamageScale: 0.68,
  armourPiercing: 0.1,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

export const AK47: WeaponSpec = {
  id: 'ak47',
  name: 'AK-47',
  category: 'assault',
  slot: 'primary',
  caliber: '7.62×39mm',
  fireMode: 'auto',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'pm2-8x'],
  magazineSize: 30,
  fireInterval: 0.1,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.5,
  range: 220,
  recoilKick: 0.028,
  recoilHorizontal: 0.009,
  recoilRecovery: 9.5,
  aimTime: 0.24,
  aimZoom: 1.4,
  aimRecoilFactor: 0.65,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
  damage: 47,
  headshotMultiplier: 2.4,
  falloffStart: 30,
  falloffEnd: 80,
  minDamageScale: 0.7,
  armourPiercing: 0.15,
  attachmentSlots: ['muzzle', 'magazine'],
};

export const SCAR_H: WeaponSpec = {
  id: 'scar-h',
  name: 'SCAR-H',
  category: 'assault',
  slot: 'primary',
  caliber: '7.62×51mm',
  fireMode: 'auto',
  scopeStyle: 'telescopic',
  defaultOptic: 'acog',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 20,
  fireInterval: 0.096,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.45,
  range: 260,
  recoilKick: 0.025,
  recoilHorizontal: 0.008,
  recoilRecovery: 10.5,
  aimTime: 0.23,
  aimZoom: 3.5,
  aimRecoilFactor: 0.6,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
  damage: 55,
  headshotMultiplier: 2.2,
  falloffStart: 38,
  falloffEnd: 100,
  minDamageScale: 0.76,
  armourPiercing: 0.2,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

export const MP5: WeaponSpec = {
  id: 'mp5',
  name: 'MP5',
  category: 'smg',
  slot: 'primary',
  caliber: '9×19mm',
  fireMode: 'auto',
  scopeStyle: 'reflex',
  defaultOptic: 'red-dot',
  compatibleOptics: ['irons', 'red-dot', 'holo'],
  magazineSize: 30,
  fireInterval: 0.075,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.05,
  range: 130,
  recoilKick: 0.013,
  recoilHorizontal: 0.004,
  recoilRecovery: 14.5,
  aimTime: 0.17,
  aimZoom: 1.35,
  aimRecoilFactor: 0.65,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.28,
  damage: 33,
  headshotMultiplier: 1.85,
  falloffStart: 16,
  falloffEnd: 42,
  minDamageScale: 0.55,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'magazine'],
};

export const REMINGTON_870: WeaponSpec = {
  id: 'remington-870',
  name: 'Remington 870',
  category: 'shotgun',
  slot: 'primary',
  caliber: '12 Gauge',
  fireMode: 'pump',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo'],
  magazineSize: 6,
  fireInterval: 0.8,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.7,
  range: 55,
  recoilKick: 0.068,
  recoilHorizontal: 0.012,
  recoilRecovery: 6.5,
  aimTime: 0.23,
  aimZoom: 1.25,
  aimRecoilFactor: 0.78,
  pellets: 8,
  pelletSpread: 0.038,
  aimSpreadFactor: 0.68,
  equipTime: 0.38,
  damage: 10.75,
  headshotMultiplier: 1.5,
  falloffStart: 10,
  falloffEnd: 28,
  minDamageScale: 0.35,
  armourPiercing: 0,
  attachmentSlots: ['muzzle'],
};

export const AWM: WeaponSpec = {
  id: 'awm',
  name: 'AWM',
  category: 'sniper',
  slot: 'primary',
  caliber: '.338 Lapua',
  fireMode: 'bolt',
  scopeStyle: 'telescopic',
  defaultOptic: 'sniper-scope',
  compatibleOptics: ['acog', 'pso-1', 'lpvo', 'pm2-8x', 'sniper-scope'],
  magazineSize: 5,
  fireInterval: 1.35,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 3.1,
  range: 450,
  recoilKick: 0.082,
  recoilHorizontal: 0.01,
  recoilRecovery: 5.2,
  aimTime: 0.26,
  aimZoom: 6,
  aimRecoilFactor: 0.82,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.42,
  damage: 120,
  headshotMultiplier: 2.2,
  falloffStart: 80,
  falloffEnd: 220,
  minDamageScale: 0.88,
  armourPiercing: 0.35,
  attachmentSlots: ['muzzle', 'magazine', 'buttstock'],
};

/** Semi-automatic pistol: one shot per trigger pull. */
export const M1911: WeaponSpec = {
  id: 'm1911',
  name: 'M1911',
  category: 'pistol',
  slot: 'secondary',
  caliber: '.45 ACP',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot'],
  magazineSize: 7,
  fireInterval: 0.13,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.1,
  range: 100,
  recoilKick: 0.032,
  recoilHorizontal: 0.008,
  recoilRecovery: 10,
  aimTime: 0.18,
  aimZoom: 1.3,
  aimRecoilFactor: 0.68,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.25,
  damage: 42,
  headshotMultiplier: 1.9,
  falloffStart: 15,
  falloffEnd: 38,
  minDamageScale: 0.58,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'magazine'],
};

export const DESERT_EAGLE: WeaponSpec = {
  id: 'desert-eagle',
  name: 'Desert Eagle',
  category: 'pistol',
  slot: 'secondary',
  caliber: '.50 AE',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'acog'],
  magazineSize: 7,
  fireInterval: 0.21,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.35,
  range: 150,
  recoilKick: 0.056,
  recoilHorizontal: 0.014,
  recoilRecovery: 7.2,
  aimTime: 0.22,
  aimZoom: 1.35,
  aimRecoilFactor: 0.72,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.29,
  damage: 63,
  headshotMultiplier: 2.1,
  falloffStart: 22,
  falloffEnd: 55,
  minDamageScale: 0.65,
  armourPiercing: 0.1,
  attachmentSlots: ['magazine'],
};

/** Three-round burst service rifle: one pull fires three rounds at 800 RPM. */
export const M16A4: WeaponSpec = {
  id: 'm16a4',
  name: 'M16A4',
  category: 'assault',
  slot: 'primary',
  caliber: '5.56×45mm',
  fireMode: 'burst',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 30,
  fireInterval: 0.24,
  burstCount: 3,
  burstInterval: 0.075,
  reloadTime: 2.3,
  range: 240,
  recoilKick: 0.016,
  recoilHorizontal: 0.004,
  recoilRecovery: 12,
  aimTime: 0.22,
  aimZoom: 1.4,
  aimRecoilFactor: 0.62,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
  damage: 41,
  headshotMultiplier: 2.0,
  falloffStart: 32,
  falloffEnd: 85,
  minDamageScale: 0.72,
  armourPiercing: 0.1,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

/** Bullpup assault rifle with a full-length barrel in a short package. */
export const AUG_A3: WeaponSpec = {
  id: 'aug-a3',
  name: 'AUG A3',
  category: 'assault',
  slot: 'primary',
  caliber: '5.56×45mm',
  fireMode: 'auto',
  scopeStyle: 'reflex',
  defaultOptic: 'red-dot',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 30,
  fireInterval: 0.084,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.9,
  range: 230,
  recoilKick: 0.017,
  recoilHorizontal: 0.004,
  recoilRecovery: 11.5,
  aimTime: 0.21,
  aimZoom: 1.35,
  aimRecoilFactor: 0.6,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.35,
  damage: 43,
  headshotMultiplier: 1.95,
  falloffStart: 30,
  falloffEnd: 80,
  minDamageScale: 0.7,
  armourPiercing: 0.1,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

/** Slow-firing polymer submachine gun in .45 ACP. */
export const UMP45: WeaponSpec = {
  id: 'ump45',
  name: 'UMP45',
  category: 'smg',
  slot: 'primary',
  caliber: '.45 ACP',
  fireMode: 'auto',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo'],
  magazineSize: 25,
  fireInterval: 0.1,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.2,
  range: 120,
  recoilKick: 0.016,
  recoilHorizontal: 0.005,
  recoilRecovery: 13,
  aimTime: 0.18,
  aimZoom: 1.35,
  aimRecoilFactor: 0.66,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.3,
  damage: 39,
  headshotMultiplier: 1.8,
  falloffStart: 14,
  falloffEnd: 40,
  minDamageScale: 0.55,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

/** Very fast-firing .45 ACP submachine gun with a recoil-redirecting action. */
export const VECTOR: WeaponSpec = {
  id: 'vector',
  name: 'KRISS Vector',
  category: 'smg',
  slot: 'primary',
  caliber: '.45 ACP',
  fireMode: 'auto',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo'],
  magazineSize: 25,
  fireInterval: 0.05,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.0,
  range: 100,
  recoilKick: 0.011,
  recoilHorizontal: 0.004,
  recoilRecovery: 15,
  aimTime: 0.16,
  aimZoom: 1.35,
  aimRecoilFactor: 0.66,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.28,
  damage: 32,
  headshotMultiplier: 1.8,
  falloffStart: 10,
  falloffEnd: 32,
  minDamageScale: 0.5,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'grip', 'magazine'],
};

/** Kalashnikov-pattern semi-automatic shotgun fed from a box magazine. */
export const SAIGA_12: WeaponSpec = {
  id: 'saiga-12',
  name: 'Saiga-12',
  category: 'shotgun',
  slot: 'primary',
  caliber: '12 Gauge',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo'],
  magazineSize: 5,
  fireInterval: 0.24,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.8,
  range: 50,
  recoilKick: 0.058,
  recoilHorizontal: 0.012,
  recoilRecovery: 7,
  aimTime: 0.24,
  aimZoom: 1.25,
  aimRecoilFactor: 0.78,
  pellets: 10,
  pelletSpread: 0.045,
  aimSpreadFactor: 0.7,
  equipTime: 0.38,
  damage: 7.5,
  headshotMultiplier: 1.5,
  falloffStart: 8,
  falloffEnd: 26,
  minDamageScale: 0.35,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'magazine'],
};

/** Semi-automatic carbine with a fixed ten-round magazine. */
export const SKS: WeaponSpec = {
  id: 'sks',
  name: 'SKS',
  category: 'dmr',
  slot: 'primary',
  caliber: '7.62×39mm',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 10,
  fireInterval: 0.2,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.9,
  range: 320,
  recoilKick: 0.036,
  recoilHorizontal: 0.008,
  recoilRecovery: 8.5,
  aimTime: 0.25,
  aimZoom: 1.35,
  aimRecoilFactor: 0.66,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.38,
  damage: 53,
  headshotMultiplier: 2.3,
  falloffStart: 45,
  falloffEnd: 130,
  minDamageScale: 0.78,
  armourPiercing: 0.15,
  attachmentSlots: ['muzzle', 'magazine', 'buttstock'],
};

/** Light semi-automatic ranch rifle in 5.56 mm. */
export const MINI_14: WeaponSpec = {
  id: 'mini-14',
  name: 'Mini-14',
  category: 'dmr',
  slot: 'primary',
  caliber: '5.56×45mm',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot', 'holo', 'acog', 'pso-1', 'lpvo', 'pm2-8x'],
  magazineSize: 20,
  fireInterval: 0.133,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 2.4,
  range: 300,
  recoilKick: 0.024,
  recoilHorizontal: 0.005,
  recoilRecovery: 10.5,
  aimTime: 0.23,
  aimZoom: 1.35,
  aimRecoilFactor: 0.64,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
  damage: 46,
  headshotMultiplier: 2.3,
  falloffStart: 40,
  falloffEnd: 120,
  minDamageScale: 0.75,
  armourPiercing: 0.1,
  attachmentSlots: ['muzzle', 'magazine', 'buttstock'],
};

/** German bolt-action service rifle with a five-round internal magazine. */
export const KAR98K: WeaponSpec = {
  id: 'kar98k',
  name: 'Kar98k',
  category: 'sniper',
  slot: 'primary',
  caliber: '7.92×57mm',
  fireMode: 'bolt',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'acog', 'pso-1', 'lpvo', 'pm2-8x', 'sniper-scope'],
  magazineSize: 5,
  fireInterval: 1.5,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 3.4,
  range: 420,
  recoilKick: 0.078,
  recoilHorizontal: 0.009,
  recoilRecovery: 5.4,
  aimTime: 0.27,
  aimZoom: 1.3,
  aimRecoilFactor: 0.82,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.42,
  damage: 79,
  headshotMultiplier: 2.5,
  falloffStart: 70,
  falloffEnd: 200,
  minDamageScale: 0.86,
  armourPiercing: 0.3,
  attachmentSlots: ['muzzle', 'buttstock'],
};

/** Russian bolt-action service rifle with a five-round internal magazine. */
export const MOSIN_NAGANT: WeaponSpec = {
  id: 'mosin-nagant',
  name: 'Mosin–Nagant',
  category: 'sniper',
  slot: 'primary',
  caliber: '7.62×54mmR',
  fireMode: 'bolt',
  scopeStyle: 'telescopic',
  defaultOptic: 'pso-1',
  compatibleOptics: ['irons', 'acog', 'pso-1', 'lpvo', 'pm2-8x', 'sniper-scope'],
  magazineSize: 5,
  fireInterval: 1.55,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 3.5,
  range: 430,
  recoilKick: 0.08,
  recoilHorizontal: 0.009,
  recoilRecovery: 5.2,
  aimTime: 0.28,
  aimZoom: 1.3,
  aimRecoilFactor: 0.82,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.43,
  damage: 80,
  headshotMultiplier: 2.5,
  falloffStart: 70,
  falloffEnd: 205,
  minDamageScale: 0.86,
  armourPiercing: 0.3,
  attachmentSlots: ['muzzle', 'buttstock'],
};

/** Soviet light machine gun fed from a 47-round pan on top of the receiver. */
export const DP_28: WeaponSpec = {
  id: 'dp-28',
  name: 'DP-28',
  category: 'lmg',
  slot: 'primary',
  caliber: '7.62×54mmR',
  fireMode: 'auto',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons'],
  magazineSize: 47,
  fireInterval: 0.109,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 4.6,
  range: 300,
  recoilKick: 0.021,
  recoilHorizontal: 0.007,
  recoilRecovery: 9,
  aimTime: 0.34,
  aimZoom: 1.3,
  aimRecoilFactor: 0.6,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.5,
  damage: 51,
  headshotMultiplier: 2.3,
  falloffStart: 40,
  falloffEnd: 110,
  minDamageScale: 0.76,
  armourPiercing: 0.2,
  attachmentSlots: [],
};

/** Fifteen-round 9 mm service pistol. */
export const BERETTA_92FS: WeaponSpec = {
  id: 'beretta-92fs',
  name: 'Beretta 92FS',
  category: 'pistol',
  slot: 'secondary',
  caliber: '9×19mm',
  fireMode: 'semi',
  scopeStyle: 'irons',
  defaultOptic: 'irons',
  compatibleOptics: ['irons', 'red-dot'],
  magazineSize: 15,
  fireInterval: 0.11,
  burstCount: 1,
  burstInterval: 0,
  reloadTime: 1.9,
  range: 90,
  recoilKick: 0.024,
  recoilHorizontal: 0.006,
  recoilRecovery: 11.5,
  aimTime: 0.17,
  aimZoom: 1.3,
  aimRecoilFactor: 0.68,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.24,
  damage: 33,
  headshotMultiplier: 2.0,
  falloffStart: 14,
  falloffEnd: 36,
  minDamageScale: 0.55,
  armourPiercing: 0,
  attachmentSlots: ['muzzle', 'magazine'],
};

export const WEAPONS: readonly WeaponSpec[] = [
  HK416,
  AK47,
  SCAR_H,
  M16A4,
  AUG_A3,
  MP5,
  UMP45,
  VECTOR,
  REMINGTON_870,
  SAIGA_12,
  SKS,
  MINI_14,
  AWM,
  KAR98K,
  MOSIN_NAGANT,
  DP_28,
  M1911,
  DESERT_EAGLE,
  BERETTA_92FS,
];

const WEAPON_BY_ID: Readonly<Record<WeaponId, WeaponSpec>> = {
  hk416: HK416,
  ak47: AK47,
  'scar-h': SCAR_H,
  m16a4: M16A4,
  'aug-a3': AUG_A3,
  mp5: MP5,
  ump45: UMP45,
  vector: VECTOR,
  'remington-870': REMINGTON_870,
  'saiga-12': SAIGA_12,
  sks: SKS,
  'mini-14': MINI_14,
  awm: AWM,
  kar98k: KAR98K,
  'mosin-nagant': MOSIN_NAGANT,
  'dp-28': DP_28,
  m1911: M1911,
  'desert-eagle': DESERT_EAGLE,
  'beretta-92fs': BERETTA_92FS,
};

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEAPON_BY_ID, value);
}

export function getWeaponSpec(id: WeaponId): WeaponSpec {
  return WEAPON_BY_ID[id];
}

/** Rounds per minute while the trigger is worked as fast as the action allows. */
export function weaponRpm(spec: WeaponSpec): number {
  const interval = spec.burstCount > 1 ? spec.burstInterval : spec.fireInterval;
  return Math.round(60 / interval);
}

/** Total torso damage of one trigger pull's projectiles at point-blank range. */
export function weaponShotDamage(spec: WeaponSpec): number {
  return spec.damage * spec.pellets;
}

export interface Loadout {
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
  /** Optional per-weapon mounted optic overrides; missing entries use `spec.defaultOptic`. */
  readonly optics?: Readonly<Partial<Record<WeaponId, OpticId>>>;
  /** Optional per-weapon fitted attachments; missing entries mean every slot is empty. */
  readonly attachments?: Readonly<Partial<Record<WeaponId, WeaponAttachments>>>;
}

export const DEFAULT_LOADOUT: Loadout = {
  primary: 'hk416',
  secondary: 'm1911',
  optics: {},
};

/** Clamp/resolve a requested optic against `weaponId`'s compatible optics list. */
export function clampWeaponOptic(weaponId: WeaponId, candidate?: OpticId): OpticId {
  const spec = getWeaponSpec(weaponId);
  if (candidate && spec.compatibleOptics.includes(candidate)) return candidate;
  return spec.defaultOptic;
}

/** Resolve a valid compatible optic for `weaponId` given `loadout` (always falls back cleanly). */
export function resolveWeaponOptic(loadout: Loadout | undefined, weaponId: WeaponId): OpticId {
  return clampWeaponOptic(weaponId, loadout?.optics?.[weaponId]);
}

/** The attachments a loadout asks for on `weaponId` (not yet checked for fit). */
export function resolveWeaponAttachments(
  loadout: Loadout | undefined,
  weaponId: WeaponId,
): WeaponAttachments {
  return loadout?.attachments?.[weaponId] ?? NO_ATTACHMENTS;
}

export interface EffectiveWeaponSpec extends WeaponSpec {
  readonly opticId: OpticId;
  readonly optic: OpticSpec;
  /** Magnification levels for the currently mounted optic (`[zoom]` or `[low, high]`). */
  readonly zoomStages: readonly [number] | readonly [number, number];
  /** Fitted attachments, with anything that does not fit this firearm removed. */
  readonly attachments: WeaponAttachments;
  /** Multiplier on the distance at which a shot alerts combatants (1 = unsuppressed). */
  readonly noiseRadiusScale: number;
  /** Multiplier on the visible muzzle flash (0 = hidden). */
  readonly muzzleFlashScale: number;
  /** True when the report should sound quieter and duller. */
  readonly suppressed: boolean;
}

interface EffectiveSpecCacheEntry {
  readonly opticId: OpticId | undefined;
  readonly attachments: WeaponAttachments | undefined;
  readonly spec: EffectiveWeaponSpec;
}

/** Last result per weapon, so the per-tick lookup does not rebuild an identical spec. */
const EFFECTIVE_SPEC_CACHE = new Map<WeaponId, EffectiveSpecCacheEntry>();

/**
 * Combine a firearm's base `WeaponSpec` with its mounted optic and fitted attachments into live
 * gameplay values. This is the only place attachments change a weapon's numbers.
 */
export function effectiveWeaponSpec(
  weaponId: WeaponId,
  opticId?: OpticId,
  attachments?: WeaponAttachments,
): EffectiveWeaponSpec {
  const cached = EFFECTIVE_SPEC_CACHE.get(weaponId);
  if (cached && cached.opticId === opticId && cached.attachments === attachments) {
    return cached.spec;
  }

  const base = getWeaponSpec(weaponId);
  const resolvedId =
    opticId && base.compatibleOptics.includes(opticId) ? opticId : base.defaultOptic;
  const optic = getOpticSpec(resolvedId);
  const ironZoom = base.aimZoom <= 1.45 ? base.aimZoom : 1.35;
  const zoomStages: readonly [number] | readonly [number, number] = optic.zoomStages ?? [ironZoom];
  const scopeStyle: ScopeStyle =
    optic.overlay !== 'none'
      ? 'telescopic'
      : resolvedId === 'holo'
        ? 'holo'
        : resolvedId === 'red-dot'
          ? 'reflex'
          : 'irons';

  const fitted = sanitizeAttachments(base, attachments);
  const mod = combineAttachmentModifiers(fitted);

  const spec: EffectiveWeaponSpec = {
    ...base,
    opticId: resolvedId,
    optic,
    scopeStyle,
    zoomStages,
    aimZoom: zoomStages[0],
    aimTime: (base.aimTime + optic.aimTimeBonus) * mod.aimTime,
    magazineSize: Math.max(1, Math.round(base.magazineSize * mod.magazineSize)),
    reloadTime: base.reloadTime * mod.reloadTime,
    recoilKick: base.recoilKick * mod.recoilVertical,
    recoilHorizontal: base.recoilHorizontal * mod.recoilHorizontal,
    recoilRecovery: base.recoilRecovery * mod.recoilRecovery,
    aimRecoilFactor: base.aimRecoilFactor * mod.aimedRecoil,
    pelletSpread: base.pelletSpread * mod.pelletSpread,
    minDamageScale: base.minDamageScale * mod.longRangeDamage,
    attachments: fitted,
    noiseRadiusScale: mod.noiseRadius,
    muzzleFlashScale: mod.muzzleFlash,
    suppressed: attachmentsSuppressSound(fitted),
  };
  EFFECTIVE_SPEC_CACHE.set(weaponId, { opticId, attachments, spec });
  return spec;
}

/** Live values for `weaponId` as configured in `loadout` (optic and attachments applied). */
export function loadoutWeaponSpec(
  loadout: Loadout | undefined,
  weaponId: WeaponId,
): EffectiveWeaponSpec {
  return effectiveWeaponSpec(
    weaponId,
    resolveWeaponOptic(loadout, weaponId),
    resolveWeaponAttachments(loadout, weaponId),
  );
}

/** Current target magnification taking variable-scope `zoomStage` into account. */
export function currentOpticZoom(spec: EffectiveWeaponSpec, zoomStage: 0 | 1): number {
  if (spec.zoomStages.length === 2 && zoomStage === 1) return spec.zoomStages[1];
  return spec.zoomStages[0];
}

export interface WeaponState {
  readonly weaponId: WeaponId;
  readonly activeSlot: WeaponSlot;
  readonly loadout: Loadout;
  readonly slotRounds: Readonly<Record<WeaponSlot, number>>;
  readonly rounds: number;
  /** Seconds until the next shot is allowed. */
  readonly cooldown: number;
  /** Seconds of reload left; 0 when not reloading. */
  readonly reloadRemaining: number;
  /** Seconds remaining in a weapon slot draw/equip transition; 0 when ready. */
  readonly switchRemaining: number;
  /** Upward aim offset from recent shots, in radians. */
  readonly recoil: number;
  /** Sideways aim offset from recent shots, in radians. Positive turns the muzzle left. */
  readonly recoilYaw: number;
  /** Rounds still to fire in the burst in progress; 0 between bursts. */
  readonly burstRemaining: number;
  /** Attachments fitted to the weapon in hand. */
  readonly attachments: WeaponAttachments;
  readonly triggerHeld: boolean;
  /** 0 at the hip, 1 fully aimed down the sights. */
  readonly aim: number;
  /** Active magnification stage for variable scopes (0 = low power, 1 = high power). */
  readonly zoomStage: 0 | 1;
  /** Monotonic shot count used for deterministic multi-pellet spread patterns. */
  readonly shotSequence: number;
}

export interface WeaponInput {
  readonly fire: boolean;
  readonly reload: boolean;
  readonly aim: boolean;
  /** Request switching to `'primary'` or `'secondary'`, or omit/null to stay put. */
  readonly switchSlot?: WeaponSlot | null;
  /** One-shot request to toggle variable scope magnification (e.g. LPVO 2×↔5×, PM II 6×↔10×). */
  readonly toggleZoom?: boolean;
}

export type WeaponEvent =
  'shot' | 'dry-fire' | 'reload-start' | 'reload-end' | 'weapon-switch' | 'zoom-toggle';

export function createWeapon(
  specOrLoadout: WeaponSpec | Loadout = DEFAULT_LOADOUT,
  activeSlot: WeaponSlot = 'primary',
): WeaponState {
  let loadout: Loadout;
  let slot: WeaponSlot;
  if ('id' in specOrLoadout) {
    slot = specOrLoadout.slot;
    loadout =
      slot === 'primary'
        ? { primary: specOrLoadout.id, secondary: DEFAULT_LOADOUT.secondary, optics: {} }
        : { primary: DEFAULT_LOADOUT.primary, secondary: specOrLoadout.id, optics: {} };
  } else {
    loadout = specOrLoadout;
    slot = activeSlot;
  }

  const primarySpec = loadoutWeaponSpec(loadout, loadout.primary);
  const secondarySpec = loadoutWeaponSpec(loadout, loadout.secondary);
  const slotRounds: Record<WeaponSlot, number> = {
    primary: primarySpec.magazineSize,
    secondary: secondarySpec.magazineSize,
  };
  const weaponId = loadout[slot];

  return {
    weaponId,
    activeSlot: slot,
    loadout,
    slotRounds,
    rounds: slotRounds[slot],
    cooldown: 0,
    reloadRemaining: 0,
    switchRemaining: 0,
    recoil: 0,
    recoilYaw: 0,
    burstRemaining: 0,
    attachments: slot === 'primary' ? primarySpec.attachments : secondarySpec.attachments,
    triggerHeld: false,
    aim: 0,
    zoomStage: 0,
    shotSequence: 0,
  };
}

/** Update the carried loadout in place (refilling changed slots and readying the active firearm). */
export function equipLoadout(
  state: WeaponState,
  loadout: Loadout,
  activeSlot: WeaponSlot = state.activeSlot,
): WeaponState {
  const primarySize = loadoutWeaponSpec(loadout, loadout.primary).magazineSize;
  const secondarySize = loadoutWeaponSpec(loadout, loadout.secondary).magazineSize;
  // A slot is refilled when its firearm changes or its magazine capacity changes.
  const primaryChanged =
    loadout.primary !== state.loadout.primary ||
    primarySize !== loadoutWeaponSpec(state.loadout, state.loadout.primary).magazineSize;
  const secondaryChanged =
    loadout.secondary !== state.loadout.secondary ||
    secondarySize !== loadoutWeaponSpec(state.loadout, state.loadout.secondary).magazineSize;
  const slotRounds: Record<WeaponSlot, number> = {
    primary: primaryChanged ? primarySize : Math.min(state.slotRounds.primary, primarySize),
    secondary: secondaryChanged
      ? secondarySize
      : Math.min(state.slotRounds.secondary, secondarySize),
  };
  const weaponId = loadout[activeSlot];
  return {
    ...state,
    weaponId,
    activeSlot,
    loadout,
    slotRounds,
    rounds: slotRounds[activeSlot],
    cooldown: 0,
    reloadRemaining: 0,
    switchRemaining: 0,
    recoil: 0,
    recoilYaw: 0,
    burstRemaining: 0,
    attachments: loadoutWeaponSpec(loadout, weaponId).attachments,
    aim: 0,
    zoomStage: 0,
    triggerHeld: false,
  };
}

/**
 * Immediately equip a specific firearm with a fresh loaded magazine and crisp draw transition
 * (used by Gun Game weapon-tier promotions on each kill while preserving custom optic mounts).
 */
export function equipSingleWeapon(state: WeaponState, weaponId: WeaponId): WeaponState {
  const spec = loadoutWeaponSpec(state.loadout, weaponId);
  const slot = spec.slot;
  const nextLoadout: Loadout =
    slot === 'primary'
      ? { ...state.loadout, primary: weaponId }
      : { ...state.loadout, secondary: weaponId };
  const slotRounds: Record<WeaponSlot, number> = {
    ...state.slotRounds,
    [slot]: spec.magazineSize,
  };
  return {
    ...state,
    weaponId,
    activeSlot: slot,
    loadout: nextLoadout,
    slotRounds,
    rounds: spec.magazineSize,
    cooldown: 0,
    reloadRemaining: 0,
    switchRemaining: spec.equipTime,
    recoil: 0,
    recoilYaw: 0,
    burstRemaining: 0,
    attachments: spec.attachments,
    aim: 0,
    zoomStage: 0,
    triggerHeld: false,
  };
}

/**
 * Compute deterministic unit ray directions for one trigger pull. Single-projectile guns
 * return one exact ray; shotguns return a tight core pellet plus a deterministic spread ring.
 */
export function pelletDirections(
  yaw: number,
  pitch: number,
  spec: WeaponSpec,
  aim: number,
  shotSequence: number,
): Vec3[] {
  const forward = (y: number, p: number): Vec3 => {
    const cosP = Math.cos(p);
    return { x: -Math.sin(y) * cosP, y: Math.sin(p), z: -Math.cos(y) * cosP };
  };

  if (spec.pellets <= 1 || spec.pelletSpread <= 0) {
    return [forward(yaw, pitch)];
  }

  const spread = spec.pelletSpread * (1 + (spec.aimSpreadFactor - 1) * clamp(aim, 0, 1));
  const directions: Vec3[] = [forward(yaw, pitch)];
  const ringCount = spec.pellets - 1;
  // Golden-angle twist per shot varies the pattern deterministically without randomness.
  const baseAngle = shotSequence * 2.399963229728653;

  for (let i = 0; i < ringCount; i++) {
    const angle = baseAngle + (i / ringCount) * Math.PI * 2;
    const radiusFactor = 0.56 + 0.36 * (0.5 + 0.5 * Math.sin(shotSequence * 3.1 + i * 1.7));
    const offsetYaw = Math.cos(angle) * spread * radiusFactor;
    const offsetPitch = Math.sin(angle) * spread * radiusFactor;
    directions.push(forward(yaw + offsetYaw, pitch + offsetPitch));
  }
  return directions;
}

/** Damage of one projectile at `distance` on `hitZone`, before any armour. */
export function weaponProjectileDamage(
  spec: WeaponSpec,
  distance: number,
  hitZone: HitZone,
): number {
  const span = Math.max(0.001, spec.falloffEnd - spec.falloffStart);
  const t = clamp((distance - spec.falloffStart) / span, 0, 1);
  const rangeScale = 1 + (spec.minDamageScale - 1) * t;
  const zoneScale =
    hitZone === 'head'
      ? spec.headshotMultiplier
      : hitZone === 'legs'
        ? ARMOUR_TUNING.legsDamageScale
        : 1;
  return spec.damage * rangeScale * zoneScale;
}

export const RECOIL_PATTERN = {
  /** Radians the sideways pattern advances per shot (the golden angle, so it never repeats). */
  yawStep: 2.399963229728653,
} as const;

/** Signed share (−1..1) of a weapon's sideways kick applied to shot number `shotSequence`. */
export function recoilYawPattern(shotSequence: number): number {
  return Math.sin(shotSequence * RECOIL_PATTERN.yawStep);
}

export function stepWeapon(
  state: WeaponState,
  input: WeaponInput,
  dt: number,
  specOverride?: WeaponSpec,
): { state: WeaponState; events: WeaponEvent[] } {
  const events: WeaponEvent[] = [];

  // Slot switch interrupts reloads and lowers sights cleanly.
  const requestedSlot = input.switchSlot ?? null;
  if (requestedSlot && requestedSlot !== state.activeSlot) {
    const nextId = state.loadout[requestedSlot];
    const nextSpec = loadoutWeaponSpec(state.loadout, nextId);
    const nextRounds = state.slotRounds[requestedSlot];
    events.push('weapon-switch');
    return {
      state: {
        ...state,
        weaponId: nextId,
        activeSlot: requestedSlot,
        rounds: nextRounds,
        cooldown: 0,
        reloadRemaining: 0,
        switchRemaining: nextSpec.equipTime,
        recoil: 0,
        recoilYaw: 0,
        burstRemaining: 0,
        attachments: nextSpec.attachments,
        aim: 0,
        zoomStage: 0,
        triggerHeld: input.fire,
      },
      events,
    };
  }

  const effective = loadoutWeaponSpec(state.loadout, state.weaponId);
  const spec = specOverride ?? effective;
  let rounds = state.rounds;
  let slotRounds = state.slotRounds;
  let cooldown = Math.max(0, state.cooldown - dt);
  let reloadRemaining = state.reloadRemaining;
  const switchRemaining = Math.max(0, state.switchRemaining - dt);
  const recoilDecay = Math.exp(-spec.recoilRecovery * dt);
  let recoil = state.recoil * recoilDecay;
  let recoilYaw = state.recoilYaw * recoilDecay;
  let burstRemaining = state.burstRemaining;
  let shotSequence = state.shotSequence;
  let zoomStage: 0 | 1 = effective.zoomStages.length === 2 ? state.zoomStage : 0;

  if (input.toggleZoom && effective.zoomStages.length === 2 && switchRemaining === 0) {
    zoomStage = zoomStage === 0 ? 1 : 0;
    events.push('zoom-toggle');
  }

  if (reloadRemaining > 0) {
    reloadRemaining = Math.max(0, reloadRemaining - dt);
    if (reloadRemaining === 0) {
      rounds = spec.magazineSize;
      slotRounds = { ...slotRounds, [state.activeSlot]: rounds };
      events.push('reload-end');
    }
  }

  const freshPull = input.fire && !state.triggerHeld;
  // A burst in progress keeps firing on its own; a new pull cannot restart or extend it.
  const burstInProgress = burstRemaining > 0;
  const wantsFire = burstInProgress || (spec.fireMode === 'auto' ? input.fire : freshPull);
  let wantsReload = input.reload && rounds < spec.magazineSize;

  if (wantsFire && switchRemaining === 0 && reloadRemaining === 0 && cooldown === 0) {
    if (rounds > 0) {
      rounds -= 1;
      slotRounds = { ...slotRounds, [state.activeSlot]: rounds };
      burstRemaining = burstInProgress ? burstRemaining - 1 : spec.burstCount - 1;
      if (rounds === 0) burstRemaining = 0;
      cooldown = burstRemaining > 0 ? spec.burstInterval : spec.fireInterval;
      shotSequence += 1;
      // The shot itself uses the aim from before this kick; see stepGame.
      const aimedKick = 1 + (spec.aimRecoilFactor - 1) * state.aim;
      recoil += spec.recoilKick * aimedKick;
      recoilYaw += spec.recoilHorizontal * aimedKick * recoilYawPattern(shotSequence);
      events.push('shot');
    } else if (freshPull || spec.fireMode === 'auto') {
      events.push('dry-fire');
      wantsReload = true;
    }
  }

  if (wantsReload && switchRemaining === 0 && reloadRemaining === 0) {
    reloadRemaining = spec.reloadTime;
    burstRemaining = 0;
    events.push('reload-start');
  }

  // Sights lower while switching weapons or reloading, and rise again if aim stays held.
  const aimTarget = input.aim && reloadRemaining === 0 && switchRemaining === 0 ? 1 : 0;
  const aimChange = dt / spec.aimTime;
  const aim = state.aim + clamp(aimTarget - state.aim, -aimChange, aimChange);

  return {
    state: {
      ...state,
      rounds,
      slotRounds,
      cooldown,
      reloadRemaining,
      switchRemaining,
      recoil,
      recoilYaw,
      burstRemaining,
      triggerHeld: input.fire,
      aim,
      zoomStage,
      shotSequence,
    },
    events,
  };
}
