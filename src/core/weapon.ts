/**
 * Weapons. Every firearm is a pure `WeaponSpec` run through `stepWeapon`.
 * Adding a gun means adding a spec here and registering its 3D model in src/game/weapons.
 */

import type { Vec3 } from './vec';
import { clamp } from './vec';

export type WeaponId =
  'hk416' | 'ak47' | 'scar-h' | 'mp5' | 'remington-870' | 'awm' | 'm1911' | 'desert-eagle';

export type WeaponCategory = 'assault' | 'smg' | 'shotgun' | 'sniper' | 'pistol';
export type WeaponSlot = 'primary' | 'secondary';
export type FireMode = 'semi' | 'auto' | 'pump' | 'bolt';
export type ScopeStyle = 'irons' | 'holo' | 'reflex' | 'telescopic';

export interface WeaponSpec {
  readonly id: WeaponId;
  readonly name: string;
  readonly category: WeaponCategory;
  readonly slot: WeaponSlot;
  readonly caliber: string;
  readonly fireMode: FireMode;
  readonly scopeStyle: ScopeStyle;
  readonly magazineSize: number;
  /** Minimum seconds between shots. */
  readonly fireInterval: number;
  readonly reloadTime: number;
  /** Metres a round travels. */
  readonly range: number;
  /** Radians the muzzle climbs per shot. */
  readonly recoilKick: number;
  /** Per-second rate at which the muzzle settles back. Higher is faster. */
  readonly recoilRecovery: number;
  /** Seconds to bring the sights up or lower them. */
  readonly aimTime: number;
  /** Magnification when aiming. 1 is no zoom; a 6x scope is 6. */
  readonly aimZoom: number;
  /** Recoil multiplier when fully aimed. Below 1 rewards aiming. */
  readonly aimRecoilFactor: number;
  /** Number of projectiles per trigger pull (1 for rifles/pistols, 8 for buckshot). */
  readonly pellets: number;
  /** Cone half-angle in radians for multi-pellet buckshot at hipfire (0 for single-projectile). */
  readonly pelletSpread: number;
  /** Spread multiplier while aimed down sights. */
  readonly aimSpreadFactor: number;
  /** Seconds to draw and ready the weapon after switching slots. */
  readonly equipTime: number;
}

export const HK416: WeaponSpec = {
  id: 'hk416',
  name: 'HK416',
  category: 'assault',
  slot: 'primary',
  caliber: '5.56×45mm',
  fireMode: 'auto',
  scopeStyle: 'holo',
  magazineSize: 30,
  fireInterval: 0.071,
  reloadTime: 2.25,
  range: 200,
  recoilKick: 0.017,
  recoilRecovery: 12.5,
  aimTime: 0.22,
  aimZoom: 1.5,
  aimRecoilFactor: 0.62,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.34,
};

export const AK47: WeaponSpec = {
  id: 'ak47',
  name: 'AK-47',
  category: 'assault',
  slot: 'primary',
  caliber: '7.62×39mm',
  fireMode: 'auto',
  scopeStyle: 'irons',
  magazineSize: 30,
  fireInterval: 0.1,
  reloadTime: 2.5,
  range: 220,
  recoilKick: 0.028,
  recoilRecovery: 9.5,
  aimTime: 0.25,
  aimZoom: 1.4,
  aimRecoilFactor: 0.65,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
};

export const SCAR_H: WeaponSpec = {
  id: 'scar-h',
  name: 'SCAR-H',
  category: 'assault',
  slot: 'primary',
  caliber: '7.62×51mm',
  fireMode: 'auto',
  scopeStyle: 'reflex',
  magazineSize: 20,
  fireInterval: 0.096,
  reloadTime: 2.45,
  range: 260,
  recoilKick: 0.025,
  recoilRecovery: 10.5,
  aimTime: 0.26,
  aimZoom: 1.8,
  aimRecoilFactor: 0.6,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.36,
};

export const MP5: WeaponSpec = {
  id: 'mp5',
  name: 'MP5',
  category: 'smg',
  slot: 'primary',
  caliber: '9×19mm',
  fireMode: 'auto',
  scopeStyle: 'irons',
  magazineSize: 30,
  fireInterval: 0.075,
  reloadTime: 2.05,
  range: 130,
  recoilKick: 0.013,
  recoilRecovery: 14.5,
  aimTime: 0.18,
  aimZoom: 1.35,
  aimRecoilFactor: 0.65,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.28,
};

export const REMINGTON_870: WeaponSpec = {
  id: 'remington-870',
  name: 'Remington 870',
  category: 'shotgun',
  slot: 'primary',
  caliber: '12 Gauge',
  fireMode: 'pump',
  scopeStyle: 'irons',
  magazineSize: 6,
  fireInterval: 0.8,
  reloadTime: 2.7,
  range: 55,
  recoilKick: 0.068,
  recoilRecovery: 6.5,
  aimTime: 0.24,
  aimZoom: 1.25,
  aimRecoilFactor: 0.78,
  pellets: 8,
  pelletSpread: 0.038,
  aimSpreadFactor: 0.68,
  equipTime: 0.38,
};

export const AWM: WeaponSpec = {
  id: 'awm',
  name: 'AWM',
  category: 'sniper',
  slot: 'primary',
  caliber: '.338 Lapua',
  fireMode: 'bolt',
  scopeStyle: 'telescopic',
  magazineSize: 5,
  fireInterval: 1.35,
  reloadTime: 3.1,
  range: 450,
  recoilKick: 0.082,
  recoilRecovery: 5.2,
  aimTime: 0.36,
  aimZoom: 6,
  aimRecoilFactor: 0.82,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.42,
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
  magazineSize: 7,
  fireInterval: 0.13,
  reloadTime: 2.1,
  range: 120,
  recoilKick: 0.032,
  recoilRecovery: 9,
  aimTime: 0.2,
  aimZoom: 1.3,
  aimRecoilFactor: 0.7,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.24,
};

export const DESERT_EAGLE: WeaponSpec = {
  id: 'desert-eagle',
  name: 'Desert Eagle',
  category: 'pistol',
  slot: 'secondary',
  caliber: '.50 AE',
  fireMode: 'semi',
  scopeStyle: 'irons',
  magazineSize: 7,
  fireInterval: 0.21,
  reloadTime: 2.35,
  range: 150,
  recoilKick: 0.056,
  recoilRecovery: 7.2,
  aimTime: 0.23,
  aimZoom: 1.35,
  aimRecoilFactor: 0.72,
  pellets: 1,
  pelletSpread: 0,
  aimSpreadFactor: 1,
  equipTime: 0.27,
};

export const WEAPONS: readonly WeaponSpec[] = [
  HK416,
  AK47,
  SCAR_H,
  MP5,
  REMINGTON_870,
  AWM,
  M1911,
  DESERT_EAGLE,
];

export const WEAPON_BY_ID: Readonly<Record<WeaponId, WeaponSpec>> = {
  hk416: HK416,
  ak47: AK47,
  'scar-h': SCAR_H,
  mp5: MP5,
  'remington-870': REMINGTON_870,
  awm: AWM,
  m1911: M1911,
  'desert-eagle': DESERT_EAGLE,
};

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEAPON_BY_ID, value);
}

export function getWeaponSpec(id: WeaponId): WeaponSpec {
  return WEAPON_BY_ID[id];
}

export function weaponRpm(spec: WeaponSpec): number {
  return Math.round(60 / spec.fireInterval);
}

export interface Loadout {
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
}

export const DEFAULT_LOADOUT: Loadout = {
  primary: 'hk416',
  secondary: 'm1911',
};

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
  readonly triggerHeld: boolean;
  /** 0 at the hip, 1 fully aimed down the sights. */
  readonly aim: number;
  /** Monotonic shot count used for deterministic multi-pellet spread patterns. */
  readonly shotSequence: number;
}

export interface WeaponInput {
  readonly fire: boolean;
  readonly reload: boolean;
  readonly aim: boolean;
  /** Request switching to `'primary'` or `'secondary'`, or omit/null to stay put. */
  readonly switchSlot?: WeaponSlot | null;
}

export type WeaponEvent = 'shot' | 'dry-fire' | 'reload-start' | 'reload-end' | 'weapon-switch';

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
        ? { primary: specOrLoadout.id, secondary: DEFAULT_LOADOUT.secondary }
        : { primary: DEFAULT_LOADOUT.primary, secondary: specOrLoadout.id };
  } else {
    loadout = specOrLoadout;
    slot = activeSlot;
  }

  const primarySpec = getWeaponSpec(loadout.primary);
  const secondarySpec = getWeaponSpec(loadout.secondary);
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
    triggerHeld: false,
    aim: 0,
    shotSequence: 0,
  };
}

/** Update the carried loadout in place (refilling changed slots and readying the active firearm). */
export function equipLoadout(
  state: WeaponState,
  loadout: Loadout,
  activeSlot: WeaponSlot = state.activeSlot,
): WeaponState {
  const primaryChanged = loadout.primary !== state.loadout.primary;
  const secondaryChanged = loadout.secondary !== state.loadout.secondary;
  const slotRounds: Record<WeaponSlot, number> = {
    primary: primaryChanged
      ? getWeaponSpec(loadout.primary).magazineSize
      : Math.min(state.slotRounds.primary, getWeaponSpec(loadout.primary).magazineSize),
    secondary: secondaryChanged
      ? getWeaponSpec(loadout.secondary).magazineSize
      : Math.min(state.slotRounds.secondary, getWeaponSpec(loadout.secondary).magazineSize),
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
    aim: 0,
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
    const nextSpec = getWeaponSpec(nextId);
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
        aim: 0,
        triggerHeld: input.fire,
      },
      events,
    };
  }

  const spec = specOverride ?? getWeaponSpec(state.weaponId);
  let rounds = state.rounds;
  let slotRounds = state.slotRounds;
  let cooldown = Math.max(0, state.cooldown - dt);
  let reloadRemaining = state.reloadRemaining;
  const switchRemaining = Math.max(0, state.switchRemaining - dt);
  let recoil = state.recoil * Math.exp(-spec.recoilRecovery * dt);
  let shotSequence = state.shotSequence;

  if (reloadRemaining > 0) {
    reloadRemaining = Math.max(0, reloadRemaining - dt);
    if (reloadRemaining === 0) {
      rounds = spec.magazineSize;
      slotRounds = { ...slotRounds, [state.activeSlot]: rounds };
      events.push('reload-end');
    }
  }

  const freshPull = input.fire && !state.triggerHeld;
  const wantsFire = spec.fireMode === 'auto' ? input.fire : freshPull;
  let wantsReload = input.reload && rounds < spec.magazineSize;

  if (wantsFire && switchRemaining === 0 && reloadRemaining === 0 && cooldown === 0) {
    if (rounds > 0) {
      rounds -= 1;
      slotRounds = { ...slotRounds, [state.activeSlot]: rounds };
      cooldown = spec.fireInterval;
      shotSequence += 1;
      // The shot itself uses the aim from before this kick; see stepGame.
      recoil += spec.recoilKick * (1 + (spec.aimRecoilFactor - 1) * state.aim);
      events.push('shot');
    } else if (freshPull || spec.fireMode === 'auto') {
      events.push('dry-fire');
      wantsReload = true;
    }
  }

  if (wantsReload && switchRemaining === 0 && reloadRemaining === 0) {
    reloadRemaining = spec.reloadTime;
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
      triggerHeld: input.fire,
      aim,
      shotSequence,
    },
    events,
  };
}
