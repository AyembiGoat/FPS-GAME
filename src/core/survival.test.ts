/**
 * Damage, armour, dummies, healing and the aimed health readout, exercised through `stepGame`
 * on the dummy-range fixture.
 */
import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { ARMOUR_TUNING } from './damage';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import {
  createGame,
  dummyHitZone,
  stepGame,
  TARGET,
  TARGET_HEALTH_REVEAL,
  targetCentre,
} from './game';
import type { GameMap } from './map';
import { isMapId, MAP_LIST, MAPS } from './maps';
import { TEST_DUMMY, testDummyRange } from './maps/testDummyRange';
import { STANDARD_COMBAT_TUNING } from './modes';
import { eyePosition, NO_INPUT, PLAYER_TUNING, playerHitZone } from './player';
import type { Loadout, WeaponId } from './weapon';
import { getWeaponSpec, weaponProjectileDamage, WEAPONS, weaponShotDamage } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };
const map = testDummyRange;
const KIT = { bandage: 2, 'first-aid': 1, 'med-kit': 1, 'energy-drink': 1, painkiller: 1 };

function loadoutFor(weaponId: WeaponId, extra: Partial<Loadout> = {}): Loadout {
  const base: Loadout =
    getWeaponSpec(weaponId).slot === 'primary'
      ? { primary: weaponId, secondary: 'm1911' }
      : { primary: 'hk416', secondary: weaponId };
  return { ...base, ...extra };
}

function practice(weaponId: WeaponId = 'hk416', extra: Partial<Loadout> = {}): GameState {
  return createGame(map, loadoutFor(weaponId, extra), getWeaponSpec(weaponId).slot, {
    mode: 'practice',
    consumables: KIT,
  });
}

function run(state: GameState, input: GameInput, steps: number, on: GameMap = map) {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const step = stepGame(current, input, dt, on);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

const seconds = (s: number) => Math.round(s / dt);

/** Point the player at world height `y` on dummy `index`, with a settled weapon. */
function aimAt(state: GameState, index: number, y?: number): GameState {
  const spawn = map.targets[index];
  if (!spawn) throw new Error(`no target ${index}`);
  const eye = eyePosition(state.player);
  const centre = targetCentre(spawn);
  const dx = centre.x - eye.x;
  const dy = (y ?? centre.y) - eye.y;
  const dz = centre.z - eye.z;
  return {
    ...state,
    player: {
      ...state.player,
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    },
    weapon: { ...state.weapon, recoil: 0, recoilYaw: 0, cooldown: 0, triggerHeld: false },
  };
}

function shoot(state: GameState, index: number, y?: number) {
  return run(aimAt(state, index, y), { ...idle, fire: true }, 1);
}

function damaged(events: readonly GameEvent[]) {
  return events.filter((e) => e.type === 'entity-damaged');
}

describe('dummy-range fixture', () => {
  it('is reachable by id for tests but never offered to players', () => {
    expect(MAPS['test-dummy-range']).toBe(testDummyRange);
    expect(MAP_LIST).not.toContain(testDummyRange);
    expect(isMapId('test-dummy-range')).toBe(false);
  });

  it('spawns dummies with health and armour next to a plain steel plate', () => {
    const state = practice();
    expect(state.targetVitals[TEST_DUMMY.bare]).toMatchObject({ health: 100, maxHealth: 100 });
    expect(state.targetVitals[TEST_DUMMY.level2]?.armour.vest).toBe(2);
    expect(state.targetVitals[TEST_DUMMY.steel]).toBeNull();
  });
});

describe('damage against dummies', () => {
  it('deals each weapon its table damage to an unarmoured torso at 10 m', () => {
    for (const spec of WEAPONS) {
      // Rapid-fire and burst weapons are measured on their first round.
      const { state, events } = shoot(practice(spec.id), TEST_DUMMY.bare);
      const hit = damaged(events)[0];
      if (hit?.type !== 'entity-damaged') throw new Error(`${spec.id} missed`);
      const perProjectile = weaponProjectileDamage(spec, hit.distance, 'torso');
      if (spec.pellets === 1) {
        // The dummy has 100 health, so a heavier round is capped at what was left.
        expect(hit.damage, spec.id).toBeCloseTo(Math.min(100, perProjectile), 6);
        if (spec.falloffStart > hit.distance)
          expect(hit.damage, spec.id).toBeCloseTo(Math.min(100, weaponShotDamage(spec)), 6);
      } else {
        // Some pellets of a hip-fired shell miss a single silhouette; some land in the head zone.
        expect(hit.damage, spec.id).toBeGreaterThan(perProjectile);
        expect(hit.damage, spec.id).toBeLessThanOrEqual(
          weaponShotDamage(spec) * spec.headshotMultiplier,
        );
      }
      expect(hit.entity).toEqual({ kind: 'dummy', index: TEST_DUMMY.bare });
      if (spec.pellets === 1) expect(hit.zone, spec.id).toBe('torso');
      expect(hit.absorbed).toBe(0);
      expect(state.targetVitals[TEST_DUMMY.bare]?.health).toBeCloseTo(
        Math.max(0, 100 - hit.damage),
        6,
      );
    }
  });

  it('counts the upper third of the silhouette as a headshot', () => {
    const height = TARGET.headTop - TARGET.bodyBottom;
    const line = TARGET.headTop - height / 3;
    expect(dummyHitZone(line + 0.01)).toBe('head');
    expect(dummyHitZone(line - 0.01)).toBe('torso');

    const hk = getWeaponSpec('hk416');
    const head = damaged(shoot(practice('hk416'), TEST_DUMMY.bare, TARGET.headTop - 0.1).events)[0];
    if (head?.type !== 'entity-damaged') throw new Error('missed');
    expect(head.zone).toBe('head');
    expect(head.damage).toBeCloseTo(hk.damage * hk.headshotMultiplier, 6);
  });

  it('loses damage with distance', () => {
    const mp5 = getWeaponSpec('mp5');
    const near = damaged(shoot(practice('mp5'), TEST_DUMMY.bare).events)[0];
    const far = damaged(shoot(practice('mp5'), TEST_DUMMY.far).events)[0];
    if (near?.type !== 'entity-damaged' || far?.type !== 'entity-damaged')
      throw new Error('missed');
    expect(near.damage).toBeCloseTo(mp5.damage, 6);
    expect(far.damage).toBeCloseTo(mp5.damage * mp5.minDamageScale, 6);
  });

  it('reduces body damage by vest level and head damage by helmet level', () => {
    const mp5 = getWeaponSpec('mp5'); // no armour piercing
    const targets = [TEST_DUMMY.level1, TEST_DUMMY.level2, TEST_DUMMY.level3] as const;
    targets.forEach((index, i) => {
      const absorb = ARMOUR_TUNING.absorb[i + 1] ?? 0;
      const body = damaged(shoot(practice('mp5'), index).events)[0];
      const head = damaged(shoot(practice('mp5'), index, TARGET.headTop - 0.1).events)[0];
      if (body?.type !== 'entity-damaged' || head?.type !== 'entity-damaged')
        throw new Error('miss');
      expect(body.armour).toBe('vest');
      expect(body.damage).toBeCloseTo(mp5.damage * (1 - absorb), 6);
      expect(head.armour).toBe('helmet');
      expect(head.damage).toBeCloseTo(mp5.damage * mp5.headshotMultiplier * (1 - absorb), 6);
    });
  });

  it('lets armour-piercing rounds through a vest more than plain ones', () => {
    const awm = getWeaponSpec('awm');
    const hit = damaged(shoot(practice('awm'), TEST_DUMMY.level3).events)[0];
    if (hit?.type !== 'entity-damaged') throw new Error('missed');
    const absorb = ARMOUR_TUNING.absorb[3] * (1 - awm.armourPiercing);
    expect(awm.armourPiercing).toBeGreaterThan(0);
    expect(hit.damage).toBeCloseTo(Math.min(100, awm.damage * (1 - absorb)), 6);
  });

  it('breaks a vest once its pool is spent, then reports the dummy down', () => {
    // Keep the dummy alive so the level 1 vest (200 points) has time to break.
    let state = practice('sks');
    const events: GameEvent[] = [];
    for (let i = 0; i < 12 && !state.targetsDown[TEST_DUMMY.level1]; i++) {
      const vitals = state.targetVitals.map((v, index) =>
        v && index === TEST_DUMMY.level1 && v.armour.vest > 0 ? { ...v, health: 100 } : v,
      );
      const step = shoot({ ...state, targetVitals: vitals }, TEST_DUMMY.level1);
      state = step.state;
      events.push(...step.events);
    }
    const broken = events.filter((e) => e.type === 'armor-broken');
    expect(broken).toEqual([
      { type: 'armor-broken', entity: { kind: 'dummy', index: TEST_DUMMY.level1 }, piece: 'vest' },
    ]);
    // SKS: 53 per hit against 200 points: the fourth hit breaks the vest.
    const hitsBeforeBreak = events
      .slice(
        0,
        events.findIndex((e) => e.type === 'armor-broken'),
      )
      .filter((e) => e.type === 'entity-damaged').length;
    expect(hitsBeforeBreak).toBe(4);

    expect(state.targetsDown[TEST_DUMMY.level1]).toBe(true);
    expect(events).toContainEqual({
      type: 'entity-down',
      entity: { kind: 'dummy', index: TEST_DUMMY.level1 },
      weaponId: 'sks',
      headshot: false,
      distance: expect.any(Number) as number,
    });
    expect(events.some((e) => e.type === 'target-down' && e.index === TEST_DUMMY.level1)).toBe(
      true,
    );
  });

  it('still drops a steel plate with one hit and stands everything back up after a clear', () => {
    const plate = shoot(practice('m1911'), TEST_DUMMY.steel);
    expect(plate.state.targetsDown[TEST_DUMMY.steel]).toBe(true);
    expect(damaged(plate.events)).toHaveLength(0);

    let state = practice('awm');
    state = { ...state, targetsDown: state.targetsDown.map((_, i) => i !== TEST_DUMMY.bare) };
    state = shoot(state, TEST_DUMMY.bare).state;
    expect(state.targetsDown.every(Boolean)).toBe(true);
    state = run(state, idle, seconds(TARGET.resetDelay) + 2).state;
    expect(state.targetsDown.every((down) => !down)).toBe(true);
    expect(state.targetVitals[TEST_DUMMY.bare]?.health).toBe(100);
  });

  it('can be cleared by the bot, dummies and all', () => {
    const bot = createBot(map);
    let state = practice('hk416');
    let cleared = false;
    for (let i = 0; i < seconds(60) && !cleared; i++) {
      state = stepGame(state, bot(state), dt, map).state;
      cleared = state.targetsDown.every(Boolean);
    }
    expect(cleared).toBe(true);
  });
});

describe('aimed health readout', () => {
  it('shows a dummy only while aiming at it within 10 seconds of hurting it', () => {
    expect(TARGET_HEALTH_REVEAL.seconds).toBe(10);
    const fresh = run(aimAt(practice('m1911'), TEST_DUMMY.bare), { ...idle, aim: true }, 30);
    expect(fresh.state.aimedTarget).toBeNull();

    const hurt = shoot(practice('m1911'), TEST_DUMMY.bare).state;
    const hip = run(aimAt(hurt, TEST_DUMMY.bare), idle, 10);
    expect(hip.state.aimedTarget).toBeNull();

    const sighted = run(aimAt(hurt, TEST_DUMMY.bare), { ...idle, aim: true }, 30);
    expect(sighted.state.aimedTarget).toEqual({
      entity: { kind: 'dummy', index: TEST_DUMMY.bare },
      health: 100 - getWeaponSpec('m1911').damage,
      maxHealth: 100,
    });

    const elsewhere = run(aimAt(hurt, TEST_DUMMY.level1), { ...idle, aim: true }, 30);
    expect(elsewhere.state.aimedTarget).toBeNull();

    const stale = run(aimAt(hurt, TEST_DUMMY.bare), { ...idle, aim: true }, seconds(10) + 2);
    expect(stale.state.aimedTarget).toBeNull();
  });

  it('shows a hurt enemy the same way', () => {
    const arena: GameMap = {
      ...map,
      targets: [],
      enemies: [
        {
          id: 'sentry',
          archetype: 'assaulter',
          weaponId: 'm1911',
          position: { x: 0, y: 0, z: -10 },
          yaw: 0,
          patrol: [{ x: 0, y: 0, z: -10 }],
          vest: 2,
        },
      ],
    };
    let state = createGame(arena, loadoutFor('m1911'), 'secondary', { mode: 'gungame' });
    expect(state.enemies[0]?.armour.vest).toBe(2);
    const eye = eyePosition(state.player);
    state = {
      ...state,
      player: { ...state.player, yaw: 0, pitch: Math.atan2(1.2 - eye.y, 10) },
    };
    const shot = run(state, { ...idle, aim: true, fire: true }, 1, arena);
    const hit = damaged(shot.events)[0];
    if (hit?.type !== 'entity-damaged') throw new Error('missed');
    expect(hit.entity).toEqual({ kind: 'enemy', id: 'sentry' });
    expect(hit.armour).toBe('vest');
    expect(hit.damage).toBeCloseTo(getWeaponSpec('m1911').damage * 0.6, 6);
    expect(shot.state.enemies[0]?.revealRemaining).toBeCloseTo(TARGET_HEALTH_REVEAL.seconds, 1);
    expect(shot.events.some((e) => e.type === 'enemy-hit')).toBe(true);
  });
});

describe('player armour and health', () => {
  const duel = (weaponId: WeaponId, z = -9): GameMap => ({
    ...map,
    targets: [],
    enemies: [
      {
        id: 'duel',
        archetype: 'assaulter',
        weaponId,
        position: { x: 0, y: 0, z },
        yaw: Math.PI,
        patrol: [{ x: 0, y: 0, z }],
      },
    ],
  });

  it('splits the player into head, torso and legs by height', () => {
    expect(playerHitZone(PLAYER_TUNING.height - 0.05)).toBe('head');
    expect(playerHitZone(1.2)).toBe('torso');
    expect(playerHitZone(0.3)).toBe('legs');
  });

  it('starts with 100 health and the requested armour', () => {
    const state = createGame(map, undefined, 'primary', { mode: 'practice', vest: 3, helmet: 2 });
    expect(state.playerHealth).toBe(100);
    expect(state.playerArmour).toMatchObject({ vest: 3, vestDurability: 250, helmet: 2 });
    expect(state.playerBoost).toBe(0);
  });

  it('takes less damage with a vest and reports hits on armour', () => {
    const arena = duel('hk416');
    const collect = (vest: number) => {
      let state = createGame(arena, undefined, 'primary', {
        mode: 'gungame',
        seed: 5,
        vest,
        helmet: 0,
      });
      const hits: GameEvent[] = [];
      for (let i = 0; i < seconds(6) && state.outcome === 'ongoing'; i++) {
        const step = stepGame(state, idle, dt, arena);
        state = step.state;
        hits.push(...step.events.filter((e) => e.type === 'player-hit'));
      }
      return hits;
    };
    const bare = collect(0);
    const armoured = collect(3);
    expect(bare.length).toBeGreaterThan(3);
    const torso = (events: GameEvent[]) =>
      events.flatMap((e) => (e.type === 'player-hit' && e.zone === 'torso' ? [e] : []));
    const bareHit = torso(bare)[0];
    const vestHit = torso(armoured)[0];
    if (!bareHit || !vestHit) throw new Error('no torso hits');
    expect(bareHit.armour).toBeNull();
    expect(vestHit.armour).toBe('vest');
    const piercing = getWeaponSpec('hk416').armourPiercing;
    const scaled = Math.max(
      1,
      Math.round(
        weaponProjectileDamage(getWeaponSpec('hk416'), 9, 'torso') *
          STANDARD_COMBAT_TUNING.enemyDamageScale,
      ),
    );
    expect(bareHit.damage).toBe(scaled);
    expect(vestHit.damage).toBeCloseTo(scaled * (1 - ARMOUR_TUNING.absorb[3] * (1 - piercing)), 6);
  });

  it('breaks the player vest and announces it once', () => {
    const arena = duel('hk416');
    let state = createGame(arena, undefined, 'primary', { mode: 'gungame', seed: 5, vest: 1 });
    state = { ...state, playerArmour: { ...state.playerArmour, vestDurability: 4 } };
    const events: GameEvent[] = [];
    for (let i = 0; i < seconds(8) && state.outcome === 'ongoing'; i++) {
      const step = stepGame(state, idle, dt, arena);
      state = step.state;
      events.push(...step.events);
    }
    expect(events.filter((e) => e.type === 'armor-broken' && e.piece === 'vest')).toEqual([
      { type: 'armor-broken', entity: { kind: 'player' }, piece: 'vest' },
    ]);
    expect(state.playerArmour.vest).toBe(0);
  });
});

describe('healing in play', () => {
  const hurt = (health: number, weaponId: WeaponId = 'm1911'): GameState => ({
    ...practice(weaponId),
    playerHealth: health,
  });

  it('heals with the best item on request and uses it up', () => {
    const started = run(hurt(30), { ...idle, useConsumable: 'best-heal' }, 1);
    expect(started.events).toContainEqual({ type: 'consumable-start', id: 'med-kit', duration: 8 });
    expect(started.state.consumableUse?.id).toBe('med-kit');

    const done = run(started.state, idle, seconds(8) + 1);
    expect(done.state.playerHealth).toBe(100);
    expect(done.state.consumables['med-kit']).toBe(0);
    expect(done.state.consumableUse).toBeNull();
    expect(done.events.some((e) => e.type === 'consumable-complete')).toBe(true);
  });

  it('cannot fire while healing; pulling the trigger cancels instead', () => {
    const healing = run(hurt(30), { ...idle, useConsumable: 'bandage' }, 5).state;
    const pulled = run(aimAt(healing, TEST_DUMMY.steel), { ...idle, fire: true }, 1);
    expect(pulled.events.some((e) => e.type === 'shot')).toBe(false);
    expect(pulled.events).toContainEqual({
      type: 'consumable-cancel',
      id: 'bandage',
      reason: 'fired',
    });
    expect(pulled.state.weapon.rounds).toBe(healing.weapon.rounds);
    expect(pulled.state.consumables.bandage).toBe(2);
    expect(pulled.state.playerHealth).toBe(30);

    // The semi-automatic pistol needs a fresh pull after the cancel.
    const stillHeld = run(pulled.state, { ...idle, fire: true }, 5);
    expect(stillHeld.events.some((e) => e.type === 'shot')).toBe(false);
    const repulled = run(run(stillHeld.state, idle, 1).state, { ...idle, fire: true }, 1);
    expect(repulled.events.some((e) => e.type === 'shot')).toBe(true);
  });

  it('holding the trigger from before the heal does not cancel it', () => {
    const firing = run(hurt(30, 'hk416'), { ...idle, fire: true }, 3).state;
    const started = run(firing, { ...idle, fire: true, useConsumable: 'bandage' }, 1).state;
    const held = run(started, { ...idle, fire: true }, 30);
    expect(held.events.some((e) => e.type === 'shot')).toBe(false);
    expect(held.events.some((e) => e.type === 'consumable-cancel')).toBe(false);
    expect(held.state.consumableUse?.id).toBe('bandage');
  });

  it('is cancelled by switching weapon', () => {
    const healing = run(hurt(30), { ...idle, useConsumable: 'first-aid' }, 5).state;
    const switched = run(healing, { ...idle, switchSlot: 'primary' }, 1);
    expect(switched.events).toContainEqual({
      type: 'consumable-cancel',
      id: 'first-aid',
      reason: 'switched',
    });
    expect(switched.state.weapon.activeSlot).toBe('primary');
  });

  it('is cancelled by taking damage', () => {
    const arena: GameMap = {
      ...map,
      targets: [],
      enemies: [
        {
          id: 'duel',
          archetype: 'assaulter',
          weaponId: 'hk416',
          position: { x: 0, y: 0, z: -9 },
          yaw: Math.PI,
          patrol: [{ x: 0, y: 0, z: -9 }],
        },
      ],
    };
    let state = createGame(arena, undefined, 'primary', {
      mode: 'gungame',
      seed: 5,
      consumables: KIT,
    });
    state = { ...state, playerHealth: 60 };
    const events: GameEvent[] = [];
    state = run(state, { ...idle, useConsumable: 'med-kit' }, 1, arena).state;
    for (let i = 0; i < seconds(6) && state.outcome === 'ongoing'; i++) {
      const step = stepGame(state, idle, dt, arena);
      state = step.state;
      events.push(...step.events);
    }
    expect(events).toContainEqual({ type: 'consumable-cancel', id: 'med-kit', reason: 'damaged' });
    expect(state.consumables['med-kit']).toBe(1);
  });

  it('reports the cap instead of wasting an item', () => {
    const capped = run(hurt(90), { ...idle, useConsumable: 'bandage' }, 1);
    expect(capped.events).toContainEqual({
      type: 'consumable-cancel',
      id: 'bandage',
      reason: 'cap',
    });
    expect(capped.state.consumableUse).toBeNull();
  });

  it('boosts, then regenerates health over time', () => {
    const drunk = run(hurt(50), { ...idle, useConsumable: 'best-boost' }, seconds(6) + 2);
    expect(drunk.state.playerBoost).toBeGreaterThan(59);
    expect(drunk.state.consumables.painkiller).toBe(0);
    const later = run(drunk.state, idle, seconds(10));
    expect(later.state.playerHealth).toBeCloseTo(50 + 1.5 * 10, 0);
  });

  it('counts using an item as acting, so the run clock starts', () => {
    const state = run(hurt(30), { ...idle, useConsumable: 'bandage' }, 2).state;
    expect(state.run.active).toBe(true);
  });
});

describe('suppressor in play', () => {
  it('alerts enemies at half the distance', () => {
    const z = -(STANDARD_COMBAT_TUNING.gunshotAlertRange * 0.75);
    const arena: GameMap = {
      ...map,
      targets: [],
      // A wall hides the player so only sound can give them away.
      solids: [
        ...map.solids,
        { min: { x: -7, y: 0, z: -6 }, max: { x: 7, y: 4, z: -5.5 }, material: 'concrete' },
      ],
      enemies: [
        {
          id: 'listener',
          archetype: 'assaulter',
          weaponId: 'm1911',
          position: { x: 0, y: 0, z },
          yaw: 0,
          patrol: [{ x: 0, y: 0, z }],
        },
      ],
    };
    const fireOnce = (loadout: Loadout) => {
      const state = createGame(arena, loadout, 'secondary', { mode: 'gungame', seed: 3 });
      return run(state, { ...idle, fire: true }, 1, arena);
    };
    const loud = fireOnce(loadoutFor('m1911'));
    const quiet = fireOnce(
      loadoutFor('m1911', { attachments: { m1911: { muzzle: 'suppressor' } } }),
    );
    expect(loud.state.enemies[0]?.aiState).not.toBe('patrol');
    expect(loud.state.enemies[0]?.lastKnownPlayerPos).not.toBeNull();
    expect(quiet.state.enemies[0]?.aiState).toBe('patrol');
    expect(quiet.state.enemies[0]?.lastKnownPlayerPos).toBeNull();

    const loudShot = loud.events.find((e) => e.type === 'shot');
    const quietShot = quiet.events.find((e) => e.type === 'shot');
    expect(loudShot).toMatchObject({ suppressed: false, muzzleFlash: 1 });
    expect(quietShot).toMatchObject({ suppressed: true });
    if (quietShot?.type !== 'shot') throw new Error('no shot');
    expect(quietShot.muzzleFlash).toBeLessThan(0.5);
  });
});
