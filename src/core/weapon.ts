/** Semi-automatic pistol. One shot per trigger pull. */

export const M1911 = {
  name: 'M1911',
  magazineSize: 7,
  /** Minimum seconds between shots, however fast the trigger is pulled. */
  fireInterval: 0.13,
  reloadTime: 1.7,
  range: 120,
  /** Radians the muzzle climbs per shot. */
  recoilKick: 0.032,
  /** Per-second rate at which the muzzle settles back. Higher is faster. */
  recoilRecovery: 9,
} as const;

export interface WeaponState {
  readonly rounds: number;
  /** Seconds until the next shot is allowed. */
  readonly cooldown: number;
  /** Seconds of reload left; 0 when not reloading. */
  readonly reloadRemaining: number;
  /** Upward aim offset from recent shots, in radians. */
  readonly recoil: number;
  readonly triggerHeld: boolean;
}

export interface WeaponInput {
  readonly fire: boolean;
  readonly reload: boolean;
}

export type WeaponEvent = 'shot' | 'dry-fire' | 'reload-start' | 'reload-end';

export function createWeapon(): WeaponState {
  return {
    rounds: M1911.magazineSize,
    cooldown: 0,
    reloadRemaining: 0,
    recoil: 0,
    triggerHeld: false,
  };
}

export function stepWeapon(
  state: WeaponState,
  input: WeaponInput,
  dt: number,
): { state: WeaponState; events: WeaponEvent[] } {
  const events: WeaponEvent[] = [];
  let rounds = state.rounds;
  let cooldown = Math.max(0, state.cooldown - dt);
  let reloadRemaining = state.reloadRemaining;
  let recoil = state.recoil * Math.exp(-M1911.recoilRecovery * dt);

  if (reloadRemaining > 0) {
    reloadRemaining = Math.max(0, reloadRemaining - dt);
    if (reloadRemaining === 0) {
      rounds = M1911.magazineSize;
      events.push('reload-end');
    }
  }

  const pulled = input.fire && !state.triggerHeld;
  let wantsReload = input.reload && rounds < M1911.magazineSize;

  if (pulled && reloadRemaining === 0 && cooldown === 0) {
    if (rounds > 0) {
      rounds -= 1;
      cooldown = M1911.fireInterval;
      // The shot itself uses the aim from before this kick; see stepGame.
      recoil += M1911.recoilKick;
      events.push('shot');
    } else {
      events.push('dry-fire');
      wantsReload = true;
    }
  }

  if (wantsReload && reloadRemaining === 0) {
    reloadRemaining = M1911.reloadTime;
    events.push('reload-start');
  }

  return {
    state: { rounds, cooldown, reloadRemaining, recoil, triggerHeld: input.fire },
    events,
  };
}
