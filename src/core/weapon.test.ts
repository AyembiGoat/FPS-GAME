import { describe, expect, it } from 'vitest';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { WeaponEvent, WeaponInput, WeaponState } from './weapon';
import {
  AK47,
  AWM,
  createWeapon,
  currentOpticZoom,
  DEFAULT_LOADOUT,
  DESERT_EAGLE,
  effectiveWeaponSpec,
  equipLoadout,
  HK416,
  M1911,
  MP5,
  OPTICS,
  pelletDirections,
  REMINGTON_870,
  SCAR_H,
  stepWeapon,
  WEAPONS,
  weaponRpm,
} from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: WeaponInput = { fire: false, reload: false, aim: false };
const fire: WeaponInput = { ...idle, fire: true };
const reload: WeaponInput = { ...idle, reload: true };
const aim: WeaponInput = { ...idle, aim: true };

function run(state: WeaponState, input: WeaponInput, steps: number) {
  const events: WeaponEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const step = stepWeapon(current, input, dt);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

const stepsFor = (seconds: number) => Math.ceil(seconds / dt) + 1;

/** Pull and release the trigger, waiting out the fire interval. */
function pull(state: WeaponState, interval = M1911.fireInterval) {
  const pulled = run(state, fire, 1);
  const released = run(pulled.state, idle, stepsFor(interval));
  return { state: released.state, events: [...pulled.events, ...released.events] };
}

function emptyMagazine(spec = M1911): WeaponState {
  let state = createWeapon(spec);
  for (let i = 0; i < spec.magazineSize; i++) state = pull(state, spec.fireInterval).state;
  return state;
}

describe('weapon catalogue', () => {
  it('defines 8 unique weapons across primary and secondary slots with sane values', () => {
    expect(WEAPONS).toHaveLength(8);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(8);
    expect(WEAPONS.filter((w) => w.slot === 'primary')).toHaveLength(6);
    expect(WEAPONS.filter((w) => w.slot === 'secondary')).toHaveLength(2);
    for (const spec of WEAPONS) {
      expect(spec.magazineSize).toBeGreaterThan(0);
      expect(spec.fireInterval).toBeGreaterThan(0);
      expect(spec.reloadTime).toBeGreaterThan(0);
      expect(spec.aimZoom).toBeGreaterThanOrEqual(1);
      expect(spec.pellets).toBeGreaterThanOrEqual(1);
      expect(weaponRpm(spec)).toBeGreaterThan(20);
    }
    expect(AWM.aimZoom).toBeGreaterThanOrEqual(5);
    expect(REMINGTON_870.pellets).toBe(8);
    expect(REMINGTON_870.pelletSpread).toBeGreaterThan(0);
  });
});

describe('stepWeapon semi-auto (M1911 & Desert Eagle)', () => {
  it('fires one round per trigger pull, not while held', () => {
    const held = run(createWeapon(M1911), fire, 120);
    expect(held.events).toEqual(['shot']);
    expect(held.state.rounds).toBe(M1911.magazineSize - 1);
  });

  it('will not fire faster than the fire interval', () => {
    let state = createWeapon(M1911);
    const events: WeaponEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const step = stepWeapon(state, i % 2 === 0 ? fire : idle, dt);
      state = step.state;
      events.push(...step.events);
    }
    expect(events).toEqual(['shot']);
  });

  it('clicks and reloads when fired empty', () => {
    const empty = emptyMagazine(M1911);
    expect(empty.rounds).toBe(0);
    const step = stepWeapon(empty, fire, dt);
    expect(step.events).toEqual(['dry-fire', 'reload-start']);
  });

  it('refills the magazine after the reload time and cannot fire during it', () => {
    const started = run(emptyMagazine(M1911), reload, 1);
    expect(started.events).toEqual(['reload-start']);

    const during = run(started.state, idle, 5);
    expect(stepWeapon(during.state, fire, dt).events).toEqual([]);

    const done = run(started.state, idle, stepsFor(M1911.reloadTime));
    expect(done.events).toEqual(['reload-end']);
    expect(done.state.rounds).toBe(M1911.magazineSize);
  });

  it('ignores reload with a full magazine', () => {
    expect(run(createWeapon(M1911), reload, 5).events).toEqual([]);
  });

  it('kicks on each shot and settles back (with heavier kick on Desert Eagle)', () => {
    const m1911Shot = stepWeapon(createWeapon(M1911), fire, dt).state;
    const deagleShot = stepWeapon(createWeapon(DESERT_EAGLE), fire, dt).state;
    expect(m1911Shot.recoil).toBeCloseTo(M1911.recoilKick, 5);
    expect(deagleShot.recoil).toBeGreaterThan(m1911Shot.recoil);
    expect(run(m1911Shot, idle, 120).state.recoil).toBeLessThan(M1911.recoilKick / 1000);
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
    const shot = stepWeapon(aimed, { ...aim, fire: true }, dt).state;
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

describe('fire modes: full-auto, pump, and bolt', () => {
  it('fires continuously while held on full-auto rifles and SMGs', () => {
    for (const spec of [HK416, AK47, SCAR_H, MP5]) {
      const burst = run(createWeapon(spec), fire, 60); // 1 second
      const shots = burst.events.filter((e) => e === 'shot').length;
      expect(shots).toBeGreaterThanOrEqual(9);
      expect(burst.state.rounds).toBe(spec.magazineSize - shots);
    }
  });

  it('enforces pump and bolt cycle intervals and requires a fresh trigger pull', () => {
    for (const spec of [REMINGTON_870, AWM]) {
      const held = run(createWeapon(spec), fire, 180);
      expect(held.events).toEqual(['shot']);

      // Releasing and pulling again mid-cycle does not fire early.
      const first = stepWeapon(createWeapon(spec), fire, dt).state;
      const releasedEarly = run(first, idle, Math.floor((spec.fireInterval * 0.5) / dt)).state;
      expect(stepWeapon(releasedEarly, fire, dt).events).toEqual([]);

      // Waiting the full cycle allows the next shot.
      const cycled = run(first, idle, stepsFor(spec.fireInterval)).state;
      expect(stepWeapon(cycled, fire, dt).events).toEqual(['shot']);
    }
  });
});

describe('deterministic pellet spread', () => {
  it('returns one exact direction for single-projectile weapons', () => {
    const dirs = pelletDirections(0, 0, HK416, 0, 1);
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).toEqual({ x: -0, y: 0, z: -1 });
  });

  it('returns 8 deterministic, tighter-when-aimed directions for the Remington 870', () => {
    const hipA = pelletDirections(0, 0, REMINGTON_870, 0, 1);
    const hipB = pelletDirections(0, 0, REMINGTON_870, 0, 1);
    const hipNext = pelletDirections(0, 0, REMINGTON_870, 0, 2);
    const ads = pelletDirections(0, 0, REMINGTON_870, 1, 1);

    expect(hipA).toHaveLength(8);
    expect(hipA).toEqual(hipB);
    expect(hipA).not.toEqual(hipNext);

    const maxSpread = (dirs: typeof hipA) => Math.max(...dirs.map((d) => Math.hypot(d.x, d.y)));
    expect(maxSpread(hipA)).toBeGreaterThan(0.01);
    expect(maxSpread(ads)).toBeLessThan(maxSpread(hipA));
  });
});

describe('weapon slot switching & loadouts', () => {
  it('switches between primary and secondary slots, preserves rounds, and enforces equip time', () => {
    let state = createWeapon(DEFAULT_LOADOUT, 'primary');
    expect(state.weaponId).toBe('hk416');
    // Fire 3 shots from primary.
    state = run(state, fire, 16).state;
    const primaryAfterShots = state.rounds;
    expect(primaryAfterShots).toBeLessThan(HK416.magazineSize);

    // Switch to secondary: emits weapon-switch and blocks firing during draw.
    const switched = stepWeapon(state, { ...idle, switchSlot: 'secondary' }, dt);
    expect(switched.events).toEqual(['weapon-switch']);
    expect(switched.state.weaponId).toBe('m1911');
    expect(switched.state.rounds).toBe(M1911.magazineSize);
    expect(switched.state.switchRemaining).toBe(M1911.equipTime);

    // Cannot fire mid-draw.
    expect(stepWeapon(switched.state, fire, dt).events).toEqual([]);

    // Once draw completes, secondary fires normally and primary ammo is preserved.
    const drawn = run(switched.state, idle, stepsFor(M1911.equipTime)).state;
    const firedSecondary = stepWeapon(drawn, fire, dt);
    expect(firedSecondary.events).toEqual(['shot']);
    expect(firedSecondary.state.rounds).toBe(M1911.magazineSize - 1);

    const backToPrimary = stepWeapon(firedSecondary.state, { ...idle, switchSlot: 'primary' }, dt);
    expect(backToPrimary.state.weaponId).toBe('hk416');
    expect(backToPrimary.state.rounds).toBe(primaryAfterShots);
  });

  it('cancels an active reload when switching weapons', () => {
    const empty = emptyMagazine(HK416);
    const reloading = stepWeapon(empty, reload, dt).state;
    expect(reloading.reloadRemaining).toBeGreaterThan(0);

    const switched = stepWeapon(reloading, { ...idle, switchSlot: 'secondary' }, dt).state;
    expect(switched.reloadRemaining).toBe(0);
    expect(switched.activeSlot).toBe('secondary');
  });

  it('updates loadout in place via equipLoadout and refills changed weapons', () => {
    const start = createWeapon(DEFAULT_LOADOUT, 'primary');
    const updated = equipLoadout(start, { primary: 'awm', secondary: 'desert-eagle' }, 'primary');
    expect(updated.weaponId).toBe('awm');
    expect(updated.rounds).toBe(AWM.magazineSize);
    expect(updated.slotRounds.secondary).toBe(DESERT_EAGLE.magazineSize);
  });

  it('applies compatible optics to zoom and ADS time and rejects incompatible ones', () => {
    const scarDefault = effectiveWeaponSpec('scar-h');
    expect(scarDefault.opticId).toBe('acog');
    expect(scarDefault.aimZoom).toBe(3.5);
    expect(scarDefault.aimTime).toBeCloseTo(SCAR_H.aimTime + OPTICS.acog.aimTimeBonus, 5);

    const hkLpvo = effectiveWeaponSpec('hk416', 'lpvo');
    expect(hkLpvo.opticId).toBe('lpvo');
    expect(hkLpvo.zoomStages).toEqual([2, 5]);
    expect(currentOpticZoom(hkLpvo, 0)).toBe(2);
    expect(currentOpticZoom(hkLpvo, 1)).toBe(5);

    // M1911 cannot mount a sniper scope — falls back cleanly to irons.
    const invalidPistolOptic = effectiveWeaponSpec('m1911', 'sniper-scope');
    expect(invalidPistolOptic.opticId).toBe('irons');
  });

  it('toggles variable magnification on LPVO and sniper scopes only', () => {
    const lpvoLoadout = {
      primary: 'hk416' as const,
      secondary: 'm1911' as const,
      optics: { hk416: 'lpvo' as const },
    };
    const start = createWeapon(lpvoLoadout, 'primary');
    expect(start.zoomStage).toBe(0);

    const toggled = stepWeapon(start, { ...idle, aim: true, toggleZoom: true }, dt);
    expect(toggled.events).toContain('zoom-toggle');
    expect(toggled.state.zoomStage).toBe(1);

    const back = stepWeapon(toggled.state, { ...idle, aim: true, toggleZoom: true }, dt);
    expect(back.events).toContain('zoom-toggle');
    expect(back.state.zoomStage).toBe(0);

    // Fixed holographic sight ignores zoom toggles.
    const fixedStart = createWeapon(DEFAULT_LOADOUT, 'primary');
    const fixedToggle = stepWeapon(fixedStart, { ...idle, aim: true, toggleZoom: true }, dt);
    expect(fixedToggle.events).toEqual([]);
    expect(fixedToggle.state.zoomStage).toBe(0);
  });
});
