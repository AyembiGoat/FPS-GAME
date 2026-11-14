import { describe, expect, it } from 'vitest';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { WeaponEvent, WeaponInput, WeaponState } from './weapon';
import { createWeapon, M1911, stepWeapon } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: WeaponInput = { fire: false, reload: false, aim: false };
const fire: WeaponInput = { ...idle, fire: true };
const reload: WeaponInput = { ...idle, reload: true };
const aim: WeaponInput = { ...idle, aim: true };

function run(state: WeaponState, input: WeaponInput, steps: number) {
  const events: WeaponEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const step = stepWeapon(current, input, dt, M1911);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

const stepsFor = (seconds: number) => Math.ceil(seconds / dt) + 1;

/** Pull and release the trigger, waiting out the fire interval. */
function pull(state: WeaponState) {
  const pulled = run(state, fire, 1);
  const released = run(pulled.state, idle, stepsFor(M1911.fireInterval));
  return { state: released.state, events: [...pulled.events, ...released.events] };
}

function emptyMagazine(): WeaponState {
  let state = createWeapon(M1911);
  for (let i = 0; i < M1911.magazineSize; i++) state = pull(state).state;
  return state;
}

describe('stepWeapon', () => {
  it('fires one round per trigger pull, not while held', () => {
    const held = run(createWeapon(M1911), fire, 120);
    expect(held.events).toEqual(['shot']);
    expect(held.state.rounds).toBe(M1911.magazineSize - 1);
  });

  it('will not fire faster than the fire interval', () => {
    let state = createWeapon(M1911);
    const events: WeaponEvent[] = [];
    // Alternate press and release every step, far faster than the gun cycles.
    for (let i = 0; i < 4; i++) {
      const step = stepWeapon(state, i % 2 === 0 ? fire : idle, dt, M1911);
      state = step.state;
      events.push(...step.events);
    }
    expect(events).toEqual(['shot']);
  });

  it('clicks and reloads when fired empty', () => {
    const empty = emptyMagazine();
    expect(empty.rounds).toBe(0);
    const step = stepWeapon(empty, fire, dt, M1911);
    expect(step.events).toEqual(['dry-fire', 'reload-start']);
  });

  it('refills the magazine after the reload time and cannot fire during it', () => {
    const started = run(emptyMagazine(), reload, 1);
    expect(started.events).toEqual(['reload-start']);

    const during = run(started.state, idle, 5);
    expect(stepWeapon(during.state, fire, dt, M1911).events).toEqual([]);

    const done = run(started.state, idle, stepsFor(M1911.reloadTime));
    expect(done.events).toEqual(['reload-end']);
    expect(done.state.rounds).toBe(M1911.magazineSize);
  });

  it('ignores reload with a full magazine', () => {
    expect(run(createWeapon(M1911), reload, 5).events).toEqual([]);
  });

  it('kicks on each shot and settles back', () => {
    const shot = stepWeapon(createWeapon(M1911), fire, dt, M1911).state;
    expect(shot.recoil).toBeCloseTo(M1911.recoilKick, 5);
    expect(run(shot, idle, 120).state.recoil).toBeLessThan(M1911.recoilKick / 1000);
  });

  it('brings the sights up over the aim time and lowers them again', () => {
    const half = run(createWeapon(M1911), aim, Math.round(M1911.aimTime / dt / 2));
    expect(half.state.aim).toBeCloseTo(0.5, 1);
    const up = run(createWeapon(M1911), aim, stepsFor(M1911.aimTime));
    expect(up.state.aim).toBe(1);
    expect(run(up.state, idle, stepsFor(M1911.aimTime)).state.aim).toBe(0);
  });

  it('kicks less when aimed', () => {
    const aimed = run(createWeapon(M1911), aim, stepsFor(M1911.aimTime)).state;
    const shot = stepWeapon(aimed, { ...aim, fire: true }, dt, M1911).state;
    expect(shot.recoil).toBeCloseTo(M1911.recoilKick * M1911.aimRecoilFactor, 5);
  });

  it('lowers the sights to reload and raises them again if aim is still held', () => {
    const aimed = run(createWeapon(M1911), aim, stepsFor(M1911.aimTime)).state;
    const fired = run(run(aimed, { ...aim, fire: true }, 1).state, aim, 10).state;
    const reloading = run(fired, { ...aim, reload: true }, stepsFor(M1911.aimTime));
    expect(reloading.state.aim).toBe(0);
    const after = run(reloading.state, aim, stepsFor(M1911.reloadTime));
    expect(after.state.aim).toBe(1);
  });
});
