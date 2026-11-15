import { describe, expect, it } from 'vitest';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { WeaponAttachments } from './attachments';
import type { Loadout, WeaponEvent, WeaponId, WeaponInput, WeaponState } from './weapon';
import {
  AK47,
  AWM,
  createWeapon,
  currentOpticZoom,
  DEFAULT_LOADOUT,
  DESERT_EAGLE,
  DP_28,
  effectiveWeaponSpec,
  equipLoadout,
  HK416,
  M16A4,
  M1911,
  MINI_14,
  MP5,
  OPTIC_LIST,
  OPTICS,
  pelletDirections,
  recoilYawPattern,
  REMINGTON_870,
  SAIGA_12,
  SCAR_H,
  SKS,
  stepWeapon,
  VECTOR,
  weaponProjectileDamage,
  WEAPONS,
  weaponRpm,
  weaponShotDamage,
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
  it('defines 19 unique weapons across primary and secondary slots with sane values', () => {
    expect(WEAPONS).toHaveLength(19);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(19);
    expect(WEAPONS.filter((w) => w.slot === 'primary')).toHaveLength(16);
    expect(WEAPONS.filter((w) => w.slot === 'secondary')).toHaveLength(3);
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

  it('matches the agreed damage table, counting every pellet of a shotgun shell', () => {
    const table: Record<WeaponId, number> = {
      hk416: 39,
      ak47: 47,
      'scar-h': 55,
      mp5: 33,
      m16a4: 41,
      'aug-a3': 43,
      ump45: 39,
      vector: 32,
      sks: 53,
      'mini-14': 46,
      kar98k: 79,
      'mosin-nagant': 80,
      'remington-870': 86,
      'saiga-12': 75,
      'dp-28': 51,
      awm: 120,
      m1911: 42,
      'desert-eagle': 63,
      'beretta-92fs': 33,
    };
    for (const spec of WEAPONS) {
      expect(weaponShotDamage(spec), spec.id).toBeCloseTo(table[spec.id], 6);
    }
    expect(SAIGA_12.pellets).toBe(10);
    expect(DP_28.magazineSize).toBe(47);
  });

  it('adds marksman and machine gun categories and keeps burst as the only new fire mode', () => {
    expect(SKS.category).toBe('dmr');
    expect(MINI_14.category).toBe('dmr');
    expect(DP_28.category).toBe('lmg');
    expect(new Set(WEAPONS.map((w) => w.fireMode))).toEqual(
      new Set(['semi', 'auto', 'burst', 'pump', 'bolt']),
    );
    expect(WEAPONS.filter((w) => w.fireMode === 'burst').map((w) => w.id)).toEqual(['m16a4']);
    expect(SAIGA_12.fireMode).toBe('semi');
  });
});

describe('burst fire (M16A4)', () => {
  it('fires exactly three rounds at 800 RPM from one pull, held or tapped', () => {
    expect(M16A4.burstCount).toBe(3);
    expect(weaponRpm(M16A4)).toBe(800);

    const tapped = run(run(createWeapon(M16A4), fire, 1).state, idle, 60);
    expect(tapped.events.filter((e) => e === 'shot')).toHaveLength(2);
    expect(tapped.state.rounds).toBe(M16A4.magazineSize - 3);

    const held = run(createWeapon(M16A4), fire, 120);
    expect(held.events.filter((e) => e === 'shot')).toHaveLength(3);
    expect(held.state.burstRemaining).toBe(0);
  });

  it('spaces the rounds of a burst by the burst interval', () => {
    let state = createWeapon(M16A4);
    const shotTicks: number[] = [];
    for (let tick = 0; tick < 60; tick++) {
      const step = stepWeapon(state, tick === 0 ? fire : idle, dt);
      state = step.state;
      if (step.events.includes('shot')) shotTicks.push(tick);
    }
    const gapTicks = Math.ceil(M16A4.burstInterval / dt);
    expect(shotTicks).toEqual([0, gapTicks, gapTicks * 2]);
  });

  it('ignores a second pull in the middle of a burst', () => {
    let state = run(createWeapon(M16A4), fire, 1).state;
    let shots = 1;
    // Hammer the trigger every other tick for the length of one burst and its recovery.
    const ticks = Math.ceil((M16A4.burstInterval * 2 + M16A4.fireInterval) / dt) - 1;
    for (let tick = 0; tick < ticks; tick++) {
      const step = stepWeapon(state, tick % 2 === 0 ? idle : fire, dt);
      state = step.state;
      shots += step.events.filter((e) => e === 'shot').length;
    }
    expect(shots).toBe(3);
  });

  it('starts a new burst on the next pull and stops a burst when the magazine runs dry', () => {
    let state = createWeapon(M16A4);
    for (let burst = 0; burst < 10; burst++) {
      state = run(run(state, fire, 1).state, idle, 40).state;
    }
    expect(state.rounds).toBe(0);

    const short = { ...createWeapon(M16A4), rounds: 2 };
    const emptied = run(short, fire, 60);
    expect(emptied.events.filter((e) => e === 'shot')).toHaveLength(2);
    expect(emptied.state.burstRemaining).toBe(0);
  });
});

describe('sideways recoil', () => {
  it('pushes the muzzle sideways in a fixed pattern that settles back to zero', () => {
    const first = run(createWeapon(AK47), fire, 1).state;
    expect(first.recoilYaw).toBeCloseTo(AK47.recoilHorizontal * recoilYawPattern(1), 9);
    const again = run(createWeapon(AK47), fire, 1).state;
    expect(again.recoilYaw).toBe(first.recoilYaw);
    expect(Math.abs(run(first, idle, 240).state.recoilYaw)).toBeLessThan(1e-6);
  });
});

describe('attachments', () => {
  const kit = (weaponId: WeaponId, attachments: WeaponAttachments) =>
    effectiveWeaponSpec(weaponId, undefined, attachments);

  it('leaves a weapon unchanged with every slot empty', () => {
    const bare = effectiveWeaponSpec('hk416', 'irons');
    expect(bare.recoilKick).toBe(HK416.recoilKick);
    expect(bare.magazineSize).toBe(HK416.magazineSize);
    expect(bare.noiseRadiusScale).toBe(1);
    expect(bare.muzzleFlashScale).toBe(1);
    expect(bare.suppressed).toBe(false);
    expect(bare.attachments).toEqual({});
  });

  it('applies each muzzle device as specified', () => {
    const comp = kit('hk416', { muzzle: 'compensator' });
    expect(comp.recoilKick).toBeCloseTo(HK416.recoilKick * 0.82, 9);
    expect(comp.recoilHorizontal).toBe(HK416.recoilHorizontal);

    const brake = kit('hk416', { muzzle: 'muzzle-brake' });
    expect(brake.recoilHorizontal).toBeCloseTo(HK416.recoilHorizontal * 0.7, 9);
    expect(brake.recoilKick).toBeCloseTo(HK416.recoilKick * 0.9, 9);

    const hider = kit('hk416', { muzzle: 'flash-hider' });
    expect(hider.muzzleFlashScale).toBe(0);
    expect(hider.recoilRecovery).toBeGreaterThan(HK416.recoilRecovery);
    expect(hider.suppressed).toBe(false);

    const can = kit('hk416', { muzzle: 'suppressor' });
    expect(can.noiseRadiusScale).toBeCloseTo(0.5, 9);
    expect(can.muzzleFlashScale).toBeLessThan(0.5);
    expect(can.suppressed).toBe(true);
    expect(can.recoilKick).toBeGreaterThan(HK416.recoilKick);
    expect(weaponProjectileDamage(can, 200, 'torso')).toBeLessThan(
      weaponProjectileDamage(HK416, 200, 'torso'),
    );
    expect(weaponProjectileDamage(can, 5, 'torso')).toBe(weaponProjectileDamage(HK416, 5, 'torso'));

    const choke = kit('remington-870', { muzzle: 'choke' });
    expect(choke.pelletSpread).toBeCloseTo(REMINGTON_870.pelletSpread * 0.75, 9);
  });

  it('applies grips, magazines and stocks as specified', () => {
    const base = effectiveWeaponSpec('hk416');
    expect(kit('hk416', { grip: 'vertical-foregrip' }).recoilRecovery).toBeCloseTo(
      HK416.recoilRecovery * 1.2,
      9,
    );
    const angled = kit('hk416', { grip: 'angled-foregrip' });
    expect(angled.aimTime).toBeCloseTo(base.aimTime * 0.85, 9);
    expect(angled.recoilRecovery).toBeCloseTo(HK416.recoilRecovery * 1.05, 9);

    expect(kit('hk416', { magazine: 'extended-mag' }).magazineSize).toBe(45);
    expect(kit('hk416', { magazine: 'quickdraw-mag' }).reloadTime).toBeCloseTo(
      HK416.reloadTime * 0.7,
      9,
    );
    const both = kit('hk416', { magazine: 'extended-quickdraw-mag' });
    expect(both.magazineSize).toBe(38);
    expect(both.reloadTime).toBeCloseTo(HK416.reloadTime * 0.85, 9);

    const awmBase = effectiveWeaponSpec('awm');
    expect(kit('awm', { buttstock: 'cheek-pad' }).aimRecoilFactor).toBeCloseTo(
      AWM.aimRecoilFactor * 0.6,
      9,
    );
    expect(kit('awm', { buttstock: 'lightweight-stock' }).aimTime).toBeCloseTo(
      awmBase.aimTime * 0.8,
      9,
    );
  });

  it('stacks one part per slot and drops parts that do not fit', () => {
    const full = kit('hk416', {
      muzzle: 'compensator',
      grip: 'vertical-foregrip',
      magazine: 'extended-mag',
    });
    expect(full.recoilKick).toBeCloseTo(HK416.recoilKick * 0.82, 9);
    expect(full.recoilRecovery).toBeCloseTo(HK416.recoilRecovery * 1.2, 9);
    expect(full.magazineSize).toBe(45);

    // Grips are for assault rifles and SMGs; stocks for marksman and sniper rifles.
    expect(kit('awm', { grip: 'vertical-foregrip' }).attachments).toEqual({});
    expect(kit('hk416', { buttstock: 'cheek-pad' }).attachments).toEqual({});
    expect(kit('hk416', { muzzle: 'choke' }).attachments).toEqual({});
    expect(kit('dp-28', { muzzle: 'suppressor', magazine: 'extended-mag' }).attachments).toEqual(
      {},
    );
    expect(kit('kar98k', { magazine: 'extended-mag' }).attachments).toEqual({});
  });

  it('loads the larger magazine, carries the parts on the weapon state and refills on change', () => {
    const loadout: Loadout = {
      primary: 'hk416',
      secondary: 'm1911',
      attachments: { hk416: { magazine: 'extended-mag', muzzle: 'suppressor' } },
    };
    const weapon = createWeapon(loadout);
    expect(weapon.rounds).toBe(45);
    expect(weapon.attachments).toEqual({ magazine: 'extended-mag', muzzle: 'suppressor' });

    const emptied = run(weapon, fire, stepsFor(45 * HK416.fireInterval) + 30);
    expect(emptied.events.filter((e) => e === 'shot')).toHaveLength(45);
    const reloaded = run(emptied.state, reload, stepsFor(HK416.reloadTime) + 6);
    expect(reloaded.state.rounds).toBe(45);

    const stripped = equipLoadout(weapon, { primary: 'hk416', secondary: 'm1911' });
    expect(stripped.rounds).toBe(30);
    expect(stripped.attachments).toEqual({});

    const switched = run(weapon, { ...idle, switchSlot: 'secondary' }, 1).state;
    expect(switched.attachments).toEqual({});
  });

  it('reloads faster with a quickdraw magazine', () => {
    const loadout: Loadout = {
      primary: 'hk416',
      secondary: 'm1911',
      attachments: { hk416: { magazine: 'quickdraw-mag' } },
    };
    const started = run({ ...createWeapon(loadout), rounds: 3 }, reload, 1).state;
    const almostBase = run(started, idle, Math.floor((HK416.reloadTime * 0.7) / dt) + 1);
    expect(almostBase.events).toContain('reload-end');
  });
});

describe('PSO-1 and PM II 8× optics', () => {
  it('adds exactly two fixed-power optics', () => {
    expect(OPTIC_LIST.map((o) => o.id)).toEqual([
      'irons',
      'red-dot',
      'holo',
      'acog',
      'pso-1',
      'lpvo',
      'pm2-8x',
      'sniper-scope',
    ]);
    expect(OPTICS['pso-1'].zoomStages).toEqual([4.0]);
    expect(OPTICS['pm2-8x'].zoomStages).toEqual([8.0]);
  });

  it('fits assault, marksman and sniper rifles only', () => {
    for (const spec of WEAPONS) {
      const scoped =
        spec.category === 'assault' || spec.category === 'dmr' || spec.category === 'sniper';
      expect(spec.compatibleOptics.includes('pso-1'), spec.id).toBe(scoped);
      expect(spec.compatibleOptics.includes('pm2-8x'), spec.id).toBe(scoped);
    }
    for (const shotgun of [REMINGTON_870, SAIGA_12]) {
      expect([...shotgun.compatibleOptics]).toEqual(['irons', 'red-dot', 'holo']);
    }
    expect(VECTOR.compatibleOptics).not.toContain('pso-1');
    expect(VECTOR.compatibleOptics).not.toContain('pm2-8x');
  });

  it('has a single magnification that the zoom toggle leaves alone', () => {
    const loadout: Loadout = { primary: 'sks', secondary: 'm1911', optics: { sks: 'pm2-8x' } };
    const toggled = run(createWeapon(loadout), { ...idle, toggleZoom: true }, 1);
    expect(toggled.events).not.toContain('zoom-toggle');
    expect(currentOpticZoom(effectiveWeaponSpec('sks', 'pm2-8x'), toggled.state.zoomStage)).toBe(8);
    expect(effectiveWeaponSpec('sks', 'pso-1').aimZoom).toBe(4);
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
