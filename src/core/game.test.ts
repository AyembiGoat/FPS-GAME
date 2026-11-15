import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { bodyBox, overlaps } from './collision';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import {
  activeWeaponSpec,
  createGame,
  INITIAL_RUN_STATS,
  runAccuracyPercent,
  setGameLoadout,
  stepGame,
  TARGET,
  targetCentre,
} from './game';
import type { GameMap } from './map';
import { cargoYard, MAP_LIST, shootHouse } from './maps';
import type { GameModeId } from './modes';
import { GUN_GAME_LADDER } from './modes';
import { eyePosition, NO_INPUT, PLAYER_TUNING } from './player';
import type { Loadout, WeaponId, WeaponSlot } from './weapon';
import { DEFAULT_LOADOUT, getWeaponSpec, M1911, REMINGTON_870 } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };

/** Bare room for unit tests: player at origin facing targets or lined-up enemies along -Z. */
const range: GameMap = {
  id: 'shoot-house',
  name: 'Test range',
  subtitle: 'TEST',
  summary: 'Unit test arena',
  locationTag: 'TEST',
  sectors: ['Range'],
  bounds: { minX: -8, maxX: 8, minZ: -30, maxZ: 5 },
  spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  solids: [
    { min: { x: -8, y: -1, z: -30 }, max: { x: 8, y: 0, z: 5 }, material: 'floor' },
    { min: { x: -8, y: 0, z: -31 }, max: { x: 8, y: 4, z: -30 }, material: 'concrete' },
  ],
  targets: [{ position: { x: 0, y: 0, z: -10 }, facing: { x: 0, z: 1 } }],
  enemies: [
    {
      id: 'duel-enemy',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: 0, y: 0, z: -9 },
      yaw: Math.PI,
      patrol: [{ x: 0, y: 0, z: -9 }],
    },
  ],
};

function createPracticeGame(
  map: GameMap = range,
  loadout: Loadout = DEFAULT_LOADOUT,
  activeSlot: WeaponSlot = 'primary',
): GameState {
  return createGame(map, loadout, activeSlot, { mode: 'practice' });
}

function run(state: GameState, input: GameInput, steps: number, map = range) {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const step = stepGame(current, input, dt, map);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

function pitchToTarget(): number {
  const target = range.targets[0];
  if (!target) throw new Error('no target');
  const eye = eyePosition(createPracticeGame(range).player);
  const centre = targetCentre(target);
  return Math.atan2(centre.y - eye.y, eye.z - centre.z);
}

describe('Gun Game mode (default)', () => {
  it('defaults createGame to Gun Game at Tier 0 (M1911), locks manual slot switch, and has 8 tiers', () => {
    expect(GUN_GAME_LADDER).toHaveLength(8);
    const g = createGame(shootHouse);
    expect(g.mode).toBe('gungame');
    expect(g.mapId).toBe('shoot-house');
    expect(g.gunGameTier).toBe(0);
    expect(g.weapon.weaponId).toBe(GUN_GAME_LADDER[0]);
    expect(g.playerHealth).toBe(100);
    expect(g.enemies).toHaveLength(10);
    expect(g.targetsDown).toHaveLength(0);

    // Manual slot switching (`1`/`2`) is ignored during Gun Game so weapon lock stays intact.
    const trySwap = run(g, { ...idle, switchSlot: 'primary' }, 5, shootHouse);
    expect(trySwap.state.weapon.weaponId).toBe(GUN_GAME_LADDER[0]);
  });

  it('promotes the player up all 8 weapons on every kill and triggers victory on the 8th tier kill', () => {
    // Place 8 motionless unalerted enemies facing away (-Z) spaced behind each other so each kill advances a tier!
    const ladderArena: GameMap = {
      ...range,
      enemies: Array.from({ length: 8 }, (_, idx) => ({
        id: `ladder-e-${idx}`,
        archetype: 'assaulter' as const,
        weaponId: 'm1911' as const,
        position: { x: 0, y: 0, z: -6 - idx * 2.4 },
        yaw: 0,
        patrol: [{ x: 0, y: 0, z: -6 - idx * 2.4 }],
      })),
    };

    // Armoured, so the return fire of eight enemies cannot end the run before the ladder is climbed.
    let state = createGame(ladderArena, DEFAULT_LOADOUT, 'primary', {
      mode: 'gungame',
      seed: 99,
      vest: 3,
      helmet: 3,
    });
    // Weaken each enemy to 10 HP so a single round from each tier weapon cleanly kills in order!
    state = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, health: 10 })),
    };

    const promotedWeapons: WeaponId[] = [state.weapon.weaponId];
    let advanceEvents = 0;

    for (let tier = 0; tier < GUN_GAME_LADDER.length; tier++) {
      expect(state.gunGameTier).toBe(tier);
      expect(state.weapon.weaponId).toBe(GUN_GAME_LADDER[tier]);

      // Wait out any draw/equip transition & cooldown, release trigger, then aim directly at the next live enemy's torso.
      state = run(state, idle, 40, ladderArena).state;
      const nextTarget = state.enemies.find((e) => e.alive);
      if (!nextTarget) throw new Error('Expected live enemy for tier');
      const eye = eyePosition(state.player);
      const dx = nextTarget.position.x - eye.x;
      const dz = nextTarget.position.z - eye.z;
      const dy = nextTarget.position.y + (nextTarget.crouched ? 0.88 : 1.2) - eye.y;
      const wantedYaw = Math.atan2(-dx, -dz);
      const wantedPitch = Math.atan2(dy, Math.hypot(dx, dz));
      state = {
        ...state,
        player: { ...state.player, yaw: wantedYaw, pitch: wantedPitch },
        weapon: { ...state.weapon, recoil: 0 },
      };
      const shotRes = run(state, { ...idle, aim: true, fire: true }, 1, ladderArena);
      state = shotRes.state;

      for (const ev of shotRes.events) {
        if (ev.type === 'gun-game-advance') {
          advanceEvents++;
          promotedWeapons.push(ev.weaponId);
        }
      }
    }

    expect(advanceEvents).toBe(7);
    expect(promotedWeapons).toEqual([...GUN_GAME_LADDER]);
    expect(state.outcome).toBe('victory');
    expect(state.run.enemiesDown).toBe(8);
  });

  it('occludes bullets behind walls and enters defeat state when player HP reaches 0', () => {
    const walledArena: GameMap = {
      ...range,
      solids: [
        ...range.solids,
        { min: { x: -2, y: 0, z: -5 }, max: { x: 2, y: 3, z: -4.5 }, material: 'concrete' },
      ],
    };

    const blockedGame = createGame(walledArena, DEFAULT_LOADOUT, 'primary', { mode: 'gungame' });
    const blockedShot = run(
      blockedGame,
      { ...idle, pitchDelta: -0.03, fire: true },
      1,
      walledArena,
    );
    expect(blockedShot.state.enemies[0]?.health).toBe(100);
    expect(blockedShot.events.find((e) => e.type === 'shot')?.hit?.surface).toBe('concrete');

    const standStill = createGame(range, DEFAULT_LOADOUT, 'primary', { mode: 'gungame', seed: 7 });
    const defeated = run(standStill, idle, 720, range);
    expect(defeated.state.playerHealth).toBe(0);
    expect(defeated.state.outcome).toBe('defeat');
    expect(defeated.events.some((e) => e.type === 'player-down')).toBe(true);
  });

  it('can be won end-to-end by the bot in Gun Game mode on BOTH Shoot House and Cargo Yard', () => {
    const shWin = botCombatRun(shootHouse, 210, 'gungame');
    expect(shWin.state.outcome).toBe('victory');
    expect(shWin.state.run.enemiesDown).toBeGreaterThanOrEqual(GUN_GAME_LADDER.length);
    expect(shWin.state.playerHealth).toBeGreaterThan(0);

    const cyWin = botCombatRun(cargoYard, 210, 'gungame');
    expect(cyWin.state.outcome).toBe('victory');
    expect(cyWin.state.run.enemiesDown).toBeGreaterThanOrEqual(GUN_GAME_LADDER.length);
    expect(cyWin.state.playerHealth).toBeGreaterThan(0);
  }, 30_000);
});

describe('Practice mode shooting & target courses', () => {
  it('knocks down a target that is shot, fires 8 buckshot pellets, and auto-resets after delay', () => {
    const aimed = run(createPracticeGame(range), { ...idle, pitchDelta: pitchToTarget() }, 1);
    const { state, events } = run(aimed.state, { ...idle, fire: true }, 1);
    expect(state.targetsDown).toEqual([true]);
    expect(events.find((e) => e.type === 'shot')?.hit?.surface).toBe('target');

    const later = run(state, idle, Math.ceil(TARGET.resetDelay / dt) + 1);
    expect(later.state.targetsDown).toEqual([false]);
    expect(later.events).toContainEqual({ type: 'targets-reset' });

    const shotgunGame = createPracticeGame(
      range,
      { primary: 'remington-870', secondary: 'm1911' },
      'primary',
    );
    const sgAimed = run(shotgunGame, { ...idle, pitchDelta: pitchToTarget() }, 1);
    const sgShot = run(sgAimed.state, { ...idle, fire: true }, 1);
    expect(sgShot.events.find((e) => e.type === 'shot')?.hits).toHaveLength(REMINGTON_870.pellets);
    expect(runAccuracyPercent(sgShot.state.run)).toBe(100);
  });

  it('validates >= 1.9 m clear fall space behind all 16 targets on BOTH Shoot House and Cargo Yard', () => {
    for (const map of MAP_LIST) {
      expect(map.targets.length).toBe(16);
      const walls = map.solids.filter(
        (solid) => solid.material !== 'floor' && solid.material !== 'asphalt',
      );
      const spots = [map.spawn.position, ...map.targets.map((t) => t.position)];
      for (const spot of spots) {
        const body = bodyBox({ ...spot, y: 0.01 }, PLAYER_TUNING.radius, PLAYER_TUNING.height);
        expect(walls.some((solid) => overlaps(body, solid))).toBe(false);
      }

      for (const target of map.targets) {
        const backX = -target.facing.x;
        const backZ = -target.facing.z;
        const fallBox = {
          min: {
            x: Math.min(target.position.x, target.position.x + backX * 1.9) - 0.22,
            y: 0.05,
            z: Math.min(target.position.z, target.position.z + backZ * 1.9) - 0.22,
          },
          max: {
            x: Math.max(target.position.x, target.position.x + backX * 1.9) + 0.22,
            y: 0.9,
            z: Math.max(target.position.z, target.position.z + backZ * 1.9) + 0.22,
          },
        };
        expect(walls.some((solid) => overlaps(fallBox, solid))).toBe(false);
      }
    }
  });

  it('can be cleared end-to-end by the bot in Practice mode on BOTH Shoot House and Cargo Yard', () => {
    const shClear = botPracticeRun(shootHouse, 200);
    expect(shClear.cleared).toBe(true);

    const cyClear = botPracticeRun(cargoYard, 200);
    expect(cyClear.cleared).toBe(true);
  }, 25_000);

  it('lets the bot lean around cover, ADS before every shot, and swap loadouts cleanly', () => {
    const peekMap: GameMap = {
      ...range,
      solids: [
        ...range.solids,
        { min: { x: -0.25, y: 0, z: -4 }, max: { x: 2, y: 3, z: -3.6 }, material: 'plywood' },
      ],
    };
    const peekRes = botPracticeRun(peekMap, 20);
    expect(peekRes.cleared).toBe(true);
    expect(peekRes.leaned).toBe(true);

    const start = createPracticeGame(range);
    const next = setGameLoadout(start, { primary: 'scar-h', secondary: 'desert-eagle' }, 'primary');
    expect(activeWeaponSpec(next).id).toBe(getWeaponSpec('scar-h').id);

    // Sidearm switch when dry in Practice mode
    let dryState = createPracticeGame(range, { primary: 'awm', secondary: 'm1911' }, 'primary');
    dryState = {
      ...dryState,
      weapon: {
        ...dryState.weapon,
        rounds: 0,
        slotRounds: { primary: 0, secondary: M1911.magazineSize },
      },
    };
    const bot = createBot(range);
    let switched = false;
    for (let i = 0; i < 600 && !dryState.targetsDown[0]; i++) {
      const step = stepGame(dryState, bot(dryState), dt, range);
      dryState = step.state;
      if (step.events.some((e) => e.type === 'weapon-switch')) switched = true;
    }
    expect(switched).toBe(true);
    expect(dryState.targetsDown).toEqual([true]);
  });
});

describe('run telemetry', () => {
  it('holds the timer at zero until the player acts, then tracks time, shots, and accuracy', () => {
    const waiting = run(createPracticeGame(range), idle, 30);
    expect(waiting.state.run.elapsed).toBe(0);
    expect(waiting.state.run.active).toBe(false);
    expect(runAccuracyPercent(waiting.state.run)).toBe(0);

    const missed = run(waiting.state, { ...idle, pitchDelta: 0.12, fire: true }, 1);
    expect(missed.state.run.active).toBe(true);
    expect(missed.state.run.shotsFired).toBe(1);
    expect(missed.state.run.targetHits).toBe(0);

    const spec = activeWeaponSpec(missed.state);
    const cooled = run(missed.state, idle, Math.ceil(spec.fireInterval / dt));
    const reAimed = run(cooled.state, { ...idle, pitchDelta: pitchToTarget() - 0.12 }, 1);
    const cleared = run(reAimed.state, { ...idle, fire: true }, 1);

    expect(cleared.state.targetsDown).toEqual([true]);
    expect(cleared.state.run.active).toBe(false);
    expect(cleared.state.run.shotsFired).toBe(2);
    expect(cleared.state.run.targetHits).toBe(1);
    expect(runAccuracyPercent(cleared.state.run)).toBe(50);

    const afterReset = run(cleared.state, idle, Math.ceil(TARGET.resetDelay / dt) + 2);
    expect(afterReset.state.targetsDown).toEqual([false]);
    expect(afterReset.state.run).toEqual(INITIAL_RUN_STATS);
  });
});

function botCombatRun(
  map: GameMap,
  seconds: number,
  mode: GameModeId = 'gungame',
  loadout?: Loadout,
) {
  const bot = createBot(map);
  let state = createGame(map, loadout, 'primary', { mode, seed: 2026 });
  for (let i = 0; i < seconds / dt && state.outcome === 'ongoing'; i++) {
    state = stepGame(state, bot(state), dt, map).state;
  }
  return { state };
}

function botPracticeRun(
  map: GameMap,
  seconds: number,
  loadout?: Loadout,
  activeSlot: WeaponSlot = 'primary',
) {
  const bot = createBot(map);
  let state = createPracticeGame(map, loadout, activeSlot);
  let shots = 0;
  let leaned = false;
  let cleared = false;
  for (let i = 0; i < seconds / dt && !cleared; i++) {
    const step = stepGame(state, bot(state), dt, map);
    state = step.state;
    for (const event of step.events) {
      if (event.type !== 'shot') continue;
      shots++;
      leaned ||= Math.abs(state.player.lean) > 0.1;
    }
    cleared = state.targetsDown.length > 0 && state.targetsDown.every(Boolean);
  }
  return { state, shots, leaned, cleared };
}
