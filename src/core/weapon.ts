/**
 * Weapons. A weapon is a `WeaponSpec` (numbers only) run through `stepWeapon`.
 * Adding a gun means adding a spec here and a model in src/game/weapons.
 */

import { clamp } from './vec';

export interface WeaponSpec {
  readonly name: string;
  readonly magazineSize: number;
  /** Minimum seconds between shots, however fast the trigger is pulled. */
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
  /** Magnification when aiming. 1 is no zoom; a 4x scope is 4. */
  readonly aimZoom: number;
  /** Recoil multiplier when fully aimed. Below 1 rewards aiming. */
  readonly aimRecoilFactor: number;
}

/** Semi-automatic pistol: one shot per trigger pull. */
export const M1911: WeaponSpec = {
  name: 'M1911',
  magazineSize: 7,
  fireInterval: 0.13,
  reloadTime: 2.1,
  range: 120,
  recoilKick: 0.032,
  recoilRecovery: 9,
  aimTime: 0.2,
  aimZoom: 1.3,
  aimRecoilFactor: 0.7,
};

export interface WeaponState {
  readonly rounds: number;
  /** Seconds until the next shot is allowed. */
  readonly cooldown: number;
  /** Seconds of reload left; 0 when not reloading. */
  readonly reloadRemaining: number;
  /** Upward aim offset from recent shots, in radians. */
  readonly recoil: number;
  readonly triggerHeld: boolean;
  /** 0 at the hip, 1 fully aimed down the sights. */
  readonly aim: number;
}

export interface WeaponInput {
  readonly fire: boolean;
  readonly reload: boolean;
  readonly aim: boolean;
}

export type WeaponEvent = 'shot' | 'dry-fire' | 'reload-start' | 'reload-end';

export function createWeapon(spec: WeaponSpec): WeaponState {
  return {
    rounds: spec.magazineSize,
    cooldown: 0,
    reloadRemaining: 0,
    recoil: 0,
    triggerHeld: false,
    aim: 0,
  };
}

export function stepWeapon(
  state: WeaponState,
  input: WeaponInput,
  dt: number,
  spec: WeaponSpec,
): { state: WeaponState; events: WeaponEvent[] } {
  const events: WeaponEvent[] = [];
  let rounds = state.rounds;
  let cooldown = Math.max(0, state.cooldown - dt);
  let reloadRemaining = state.reloadRemaining;
  let recoil = state.recoil * Math.exp(-spec.recoilRecovery * dt);

  if (reloadRemaining > 0) {
    reloadRemaining = Math.max(0, reloadRemaining - dt);
    if (reloadRemaining === 0) {
      rounds = spec.magazineSize;
      events.push('reload-end');
    }
  }

  const pulled = input.fire && !state.triggerHeld;
  let wantsReload = input.reload && rounds < spec.magazineSize;

  if (pulled && reloadRemaining === 0 && cooldown === 0) {
    if (rounds > 0) {
      rounds -= 1;
      cooldown = spec.fireInterval;
      // The shot itself uses the aim from before this kick; see stepGame.
      recoil += spec.recoilKick * (1 + (spec.aimRecoilFactor - 1) * state.aim);
      events.push('shot');
    } else {
      events.push('dry-fire');
      wantsReload = true;
    }
  }

  if (wantsReload && reloadRemaining === 0) {
    reloadRemaining = spec.reloadTime;
    events.push('reload-start');
  }

  // The sights come down for a reload and back up afterwards if aim is still held.
  const aimTarget = input.aim && reloadRemaining === 0 ? 1 : 0;
  const aimChange = dt / spec.aimTime;
  const aim = state.aim + clamp(aimTarget - state.aim, -aimChange, aimChange);

  return {
    state: { rounds, cooldown, reloadRemaining, recoil, triggerHeld: input.fire, aim },
    events,
  };
}
