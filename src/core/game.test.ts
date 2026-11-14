import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { bodyBox, overlaps } from './collision';
import { isEnemyAlive } from './enemy';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import {
  activeWeaponSpec,
  createGame,
  runAccuracyPercent,
  RUN_END_COUNTDOWN,
  setGameLoadout,
  stepGame,
  TARGET,
  targetCentre,
} from './game';
import type { GameMap } from './map';
import { shootHouse } from './maps/shootHouse';
import { DEFAULT_MODE, GAME_MODES, gameMode } from './mode';
import { eyePosition, NO_INPUT, PLAYER_TUNING } from './player';
import type { Loadout, WeaponSlot } from './weapon';
import { M1911, REMINGTON_870 } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };

/** A bare room: the player at the origin facing one steel plate 10 m away down -Z. */
const range: GameMap = {
  name: 'Test range',
  bounds: { minX: -5, maxX: 5, minZ: -12, maxZ: 5 },
  spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  solids: [
    { min: { x: -5, y: -1, z: -12 }, max: { x: 5, y: 0, z: 5 }, material: 'floor' },
    { min: { x: -5, y: 0, z: -13 }, max: { x: 5, y: 4, z: -12 }, material: 'concrete' },
  ],
  targets: [{ position: { x: 0, y: 0, z: -10 }, facing: { x: 0, z: 1 } }],
  enemySpawns: [],
};

/** Two plates side by side, so knocking one down does not finish the run. */
const pair: GameMap = {
  ...range,
  targets: [
    { position: { x: 0, y: 0, z: -10 }, facing: { x: 0, z: 1 } },
    { position: { x: 3, y: 0, z: -10 }, facing: { x: 0, z: 1 } },
  ],
};

/** A bare room with one hostile 8 m away down -Z, looking straight at the player. */
const arena: GameMap = {
  name: 'Test arena',
  bounds: { minX: -8, maxX: 8, minZ: -20, maxZ: 4 },
  spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  solids: [
    { min: { x: -8, y: -1, z: -20 }, max: { x: 8, y: 0, z: 4 }, material: 'floor' },
    { min: { x: -8, y: 0, z: -21 }, max: { x: 8, y: 4, z: -20 }, material: 'concrete' },
  ],
  targets: [],
  enemySpawns: [{ position: { x: 0, y: 0, z: -8 }, yaw: Math.PI }],
};

/** The same room with a second hostile further back, so one can die without ending the run. */
const duo: GameMap = {
  ...arena,
  bounds: { minX: -8, maxX: 8, minZ: -24, maxZ: 4 },
  solids: [
    { min: { x: -8, y: -1, z: -24 }, max: { x: 8, y: 0, z: 4 }, material: 'floor' },
    { min: { x: -8, y: 0, z: -25 }, max: { x: 8, y: 4, z: -24 }, material: 'concrete' },
  ],
  enemySpawns: [
    { position: { x: 0, y: 0, z: -8 }, yaw: Math.PI },
    { position: { x: 0, y: 0, z: -20 }, yaw: Math.PI },
  ],
};

/** The arena with a concrete wall between the player and the hostile. */
const arenaWall: GameMap = {
  ...arena,
  solids: [
    ...arena.solids,
    { min: { x: -8, y: 0, z: -4 }, max: { x: 8, y: 3, z: -3.5 }, material: 'concrete' },
  ],
};

const CHEST = { x: 0, y: 1.22, z: -8 };

function run(state: GameState, input: GameInput, steps: number, map: GameMap) {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const step = stepGame(current, input, dt, map);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

/** Pitch that points the player's eye at a point, from their spawn. */
function pitchTo(map: GameMap, point: { x: number; y: number; z: number }): number {
  const eye = eyePosition(createGame(map).player);
  return Math.atan2(point.y - eye.y, Math.hypot(point.x - eye.x, point.z - eye.z));
}

const targetPitch = (map: GameMap = range) => {
  const target = map.targets[0];
  if (!target) throw new Error('no target');
  return pitchTo(map, targetCentre(target));
};

const chestPitch = pitchTo(arena, CHEST);

function aimedArena(map: GameMap = arena, pitch = chestPitch) {
  return run(createGame(map, { mode: 'firefight' }), { ...idle, pitchDelta: pitch }, 1, map).state;
}

describe('modes', () => {
  it('offers two real modes and defaults to the enemy one', () => {
    expect(GAME_MODES.map((mode) => mode.id)).toEqual(['firefight', 'steel']);
    for (const mode of GAME_MODES) {
      expect(mode.name.length).toBeGreaterThan(2);
      expect(mode.description.length).toBeGreaterThan(20);
      expect(mode.objective.length).toBeGreaterThan(10);
      expect(mode.enemies || mode.targets).toBe(true);
    }
    expect(DEFAULT_MODE).toBe('firefight');
    expect(gameMode('steel').targets).toBe(true);
    expect(gameMode('firefight').targets).toBe(false);
  });

  it('puts hostiles on the map in firefight and none in steel targets', () => {
    const fight = createGame(shootHouse, { mode: 'firefight' });
    expect(fight.enemies.length).toBe(shootHouse.enemySpawns.length);
    expect(fight.enemies.every(isEnemyAlive)).toBe(true);
    expect(fight.targetsDown.every((down) => !down)).toBe(true);

    const steel = createGame(shootHouse, { mode: 'steel' });
    expect(steel.enemies).toHaveLength(0);
    expect(steel.targetsDown).toHaveLength(shootHouse.targets.length);
  });
});

describe('stepGame shooting', () => {
  it('knocks down a target that is shot and marks the hit as steel', () => {
    const aimed = run(
      createGame(range, { mode: 'steel' }),
      { ...idle, pitchDelta: targetPitch() },
      1,
      range,
    );
    const { state, events } = run(aimed.state, { ...idle, fire: true }, 1, range);

    expect(state.targetsDown).toEqual([true]);
    const down = events.find((event) => event.type === 'target-down');
    expect(down?.index).toBe(0);
    expect(down?.distance).toBeCloseTo(10, 0);
    const shot = events.find((event) => event.type === 'shot');
    expect(shot?.hit?.surface).toBe('target');
    expect(shot?.hit?.point.z).toBeCloseTo(-10 + TARGET.thickness / 2, 5);
    expect(shot?.hits).toHaveLength(1);
  });

  it('hits the wall behind when the shot goes over the target', () => {
    const { state, events } = run(
      createGame(range, { mode: 'steel' }),
      { ...idle, pitchDelta: 0.1, fire: true },
      1,
      range,
    );
    expect(state.targetsDown).toEqual([false]);
    const shot = events.find((event) => event.type === 'shot');
    expect(shot?.hit?.surface).toBe('concrete');
    expect(shot?.hit?.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('sends a second quick shot higher than the first', () => {
    const start = createGame(pair, {
      mode: 'steel',
      loadout: { primary: 'hk416', secondary: 'm1911' },
      activeSlot: 'secondary',
    });
    const first = run(start, { ...idle, fire: true }, 1, pair);
    const wait = run(first.state, idle, Math.ceil(M1911.fireInterval / dt), pair);
    const second = run(wait.state, { ...idle, fire: true }, 1, pair);
    const height = (events: GameEvent[]) =>
      events.find((e) => e.type === 'shot')?.hit?.point.y ?? 0;
    expect(height(second.events)).toBeGreaterThan(height(first.events));
  });

  it('fires 8 buckshot pellets from the Remington 870 and keeps accuracy bounded to 100%', () => {
    const shotgunGame = createGame(range, {
      mode: 'steel',
      loadout: { primary: 'remington-870', secondary: 'm1911' },
      activeSlot: 'primary',
    });
    const aimed = run(shotgunGame, { ...idle, pitchDelta: targetPitch() }, 1, range);
    const { state, events } = run(aimed.state, { ...idle, fire: true }, 1, range);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot?.hits).toHaveLength(REMINGTON_870.pellets);
    expect(state.targetsDown).toEqual([true]);
    expect(runAccuracyPercent(state.run)).toBe(100);
  });

  it('starts a fresh run once the clear countdown ends', () => {
    const aimed = run(
      createGame(range, { mode: 'steel' }),
      { ...idle, pitchDelta: targetPitch() },
      1,
      range,
    );
    const down = run(aimed.state, { ...idle, fire: true }, 1, range);
    expect(down.state.status).toBe('won');
    expect(down.state.resetIn).toBe(RUN_END_COUNTDOWN.steel);

    const later = run(down.state, idle, Math.ceil(RUN_END_COUNTDOWN.steel / dt) + 1, range);
    expect(later.events).toContainEqual({ type: 'run-reset' });
    expect(later.state.targetsDown).toEqual([false]);
    expect(later.state.status).toBe('playing');
    expect(later.state.run).toEqual({
      elapsed: 0,
      active: false,
      shotsFired: 0,
      hits: 0,
      kills: 0,
    });
  });

  it('blocks the player with a standing target but not a fallen one', () => {
    const walk = { ...idle, forward: 1 };
    const blocked = run(createGame(pair, { mode: 'steel' }), walk, 240, pair);
    expect(blocked.state.player.position.z).toBeGreaterThan(-10);
    expect(blocked.state.player.position.z).toBeLessThan(-9);

    const aimed = run(
      createGame(pair, { mode: 'steel' }),
      { ...idle, pitchDelta: targetPitch() },
      1,
      pair,
    );
    const down = run(aimed.state, { ...idle, fire: true }, 1, pair);
    expect(down.state.targetsDown).toEqual([true, false]);
    const through = run(down.state, walk, 150, pair);
    expect(through.state.player.position.z).toBeLessThan(-10);
  });
});

describe('hostile combat', () => {
  it('damages a hostile once per round and records the hit', () => {
    const aimed = aimedArena();
    const health = aimed.enemies[0]?.health ?? 0;
    const { state, events } = run(aimed, { ...idle, fire: true }, 1, arena);
    const damaged = events.find((event) => event.type === 'enemy-damaged');
    const spec = activeWeaponSpec(aimed);
    expect(damaged?.damage).toBe(spec.damage);
    expect(state.enemies[0]?.health).toBe(health - spec.damage);
    expect(state.run.hits).toBe(1);
    expect(state.run.shotsFired).toBe(1);
    expect(state.run.kills).toBe(0);
  });

  it('does more damage with a hit to the head', () => {
    const bodyHit = run(aimedArena(arena, chestPitch), { ...idle, fire: true }, 1, arena);
    const headHit = run(
      aimedArena(arena, pitchTo(arena, { x: 0, y: 1.64, z: -8 })),
      { ...idle, fire: true },
      1,
      arena,
    );
    const bodyDamage = bodyHit.events.find((event) => event.type === 'enemy-damaged')?.damage ?? 0;
    const headDamage = headHit.events.find((event) => event.type === 'enemy-damaged')?.damage ?? 0;
    expect(headDamage).toBe(bodyDamage * 2);
  });

  it('takes a hostile from full health to dead without going below zero, then stops it acting', () => {
    let state = aimedArena();
    const events: GameEvent[] = [];
    for (let i = 0; i < 8 && state.enemies[0]?.behavior !== 'dead'; i++) {
      const spec = activeWeaponSpec(state);
      const step = run(state, { ...idle, fire: true }, 1, arena);
      state = step.state;
      events.push(...step.events);
      state = run(state, idle, Math.ceil(spec.fireInterval / dt), arena).state;
    }
    const enemy = state.enemies[0];
    expect(enemy?.behavior).toBe('dead');
    expect(enemy?.health).toBe(0);
    expect(events.some((event) => event.type === 'enemy-killed')).toBe(true);
    expect(state.run.kills).toBe(1);
    expect(state.status).toBe('won');

    const after = run(state, idle, 30, arena);
    expect(after.state.enemies[0]?.health).toBe(0);
    expect(after.state.enemies[0]?.position).toEqual(enemy?.position);
    expect(after.events.some((event) => event.type === 'enemy-shot')).toBe(false);
  });

  it('cannot shoot through a wall', () => {
    const aimed = aimedArena(arenaWall);
    const { state, events } = run(aimed, { ...idle, fire: true }, 1, arenaWall);
    expect(events.find((event) => event.type === 'shot')?.hit?.surface).toBe('concrete');
    expect(events.some((event) => event.type === 'enemy-damaged')).toBe(false);
    expect(state.enemies[0]?.health).toBe(100);
  });

  it('lets a corpse be walked through but a living hostile block the way', () => {
    const walk = { ...idle, forward: 1 };
    const blocked = run(createGame(arena, { mode: 'firefight' }), walk, 240, arena);
    expect(blocked.state.player.position.z).toBeGreaterThan(-7.8);
    expect(blocked.state.player.position.z).toBeLessThan(-5);

    let state = run(
      createGame(duo, { mode: 'firefight' }),
      { ...idle, pitchDelta: pitchTo(duo, CHEST) },
      1,
      duo,
    ).state;
    for (let i = 0; i < 8 && state.enemies[0]?.behavior !== 'dead'; i++) {
      const spec = activeWeaponSpec(state);
      state = run(state, { ...idle, fire: true }, 1, duo).state;
      state = run(state, idle, Math.ceil(spec.fireInterval / dt), duo).state;
    }
    expect(state.enemies[0]?.behavior).toBe('dead');
    expect(state.status).toBe('playing');
    const walked = run(state, walk, 240, duo);
    expect(walked.state.player.position.z).toBeLessThan(-7.5);
  });

  it('lets hostiles wound the player and ends the run at zero health', () => {
    let state = createGame(arena, { mode: 'firefight' });
    const events: GameEvent[] = [];
    for (let i = 0; i < Math.ceil(30 / dt) && state.status === 'playing'; i++) {
      const step = stepGame(state, idle, dt, arena);
      state = step.state;
      events.push(...step.events);
    }
    expect(events.some((event) => event.type === 'player-damaged')).toBe(true);
    expect(state.status).toBe('lost');
    expect(state.run.elapsed).toBeLessThan(30);
    expect(state.health).toBe(0);
    expect(events.some((event) => event.type === 'run-end' && event.outcome === 'lost')).toBe(true);
    expect(state.resetIn).toBe(RUN_END_COUNTDOWN.firefight);
    const frozen = run(state, idle, 30, arena);
    expect(frozen.state.health).toBe(0);
    expect(frozen.state.enemies[0]?.position).toEqual(state.enemies[0]?.position);
  });

  it('starts the same run over with full health and every hostile back', () => {
    const fresh = createGame(arena, { mode: 'firefight' });
    const wounded: GameState = {
      ...fresh,
      health: 0,
      status: 'lost',
      resetIn: 0.05,
      run: { elapsed: 12, active: true, shotsFired: 9, hits: 4, kills: 0 },
      weapon: { ...fresh.weapon, rounds: 3 },
    };
    const after = run(wounded, idle, 30, arena).state;
    expect(after.status).toBe('playing');
    expect(after.health).toBe(100);
    expect(after.resetIn).toBe(0);
    expect(after.enemies.every((enemy) => enemy.health === 100)).toBe(true);
    expect(after.run).toEqual({ elapsed: 0, active: false, shotsFired: 0, hits: 0, kills: 0 });
    expect(after.weapon.rounds).toBe(activeWeaponSpec(after).magazineSize);
  });
});

describe('leaning, aiming, and weapon switching in play', () => {
  /** The range with a wall that hides the target unless the player leans right. */
  const corner: GameMap = {
    ...range,
    solids: [
      ...range.solids,
      { min: { x: -5, y: 0, z: -3 }, max: { x: 0.15, y: 3, z: -2 }, material: 'plywood' },
    ],
    targets: [{ position: { x: 0.45, y: 0, z: -10 }, facing: { x: 0, z: 1 } }],
  };
  const plate = corner.targets[0] ?? range.targets[0];
  const cornerPitch = plate ? pitchTo(corner, targetCentre(plate)) : 0;

  it('fires from the leaned eye, so a lean can reach what standing cannot', () => {
    const fire = { ...idle, fire: true };
    const aimed = run(
      createGame(corner, { mode: 'steel' }),
      { ...idle, pitchDelta: cornerPitch },
      1,
      corner,
    ).state;
    const straight = run(aimed, fire, 1, corner);
    expect(straight.events.find((e) => e.type === 'shot')?.hit?.surface).toBe('plywood');

    const leaned = run(aimed, { ...idle, lean: 1 }, 30, corner).state;
    expect(run(leaned, { ...fire, lean: 1 }, 1, corner).state.targetsDown).toEqual([true]);
  });

  it('lets the bot lean out and hit a target without stepping from cover', () => {
    const result = botRun(corner, 'steel', 10);
    expect(result.cleared).toBe(true);
    expect(result.leaned).toBe(true);
    expect(Math.hypot(result.state.player.position.x, result.state.player.position.z)).toBeLessThan(
      0.05,
    );
  });

  it('has the bot aim down the sights before every shot', () => {
    const bot = createBot(range);
    let state = createGame(range, { mode: 'steel' });
    for (let i = 0; i < 600 && !state.targetsDown[0]; i++) {
      const input = bot(state);
      if (input.fire) expect(state.weapon.aim).toBe(1);
      state = stepGame(state, input, dt, range).state;
    }
    expect(state.targetsDown).toEqual([true]);
  });

  it('lets the bot switch to its sidearm when dry in front of a target', () => {
    let state = createGame(range, {
      mode: 'steel',
      loadout: { primary: 'awm', secondary: 'm1911' },
      activeSlot: 'primary',
    });
    state = {
      ...state,
      weapon: {
        ...state.weapon,
        rounds: 0,
        slotRounds: { primary: 0, secondary: M1911.magazineSize },
      },
    };
    const bot = createBot(range);
    let switched = false;
    for (let i = 0; i < 600 && !state.targetsDown[0]; i++) {
      const step = stepGame(state, bot(state), dt, range);
      state = step.state;
      if (step.events.some((e) => e.type === 'weapon-switch')) switched = true;
    }
    expect(switched).toBe(true);
    expect(state.targetsDown).toEqual([true]);
  });

  it('swaps loadouts cleanly with setGameLoadout', () => {
    const start = createGame(range, { mode: 'steel' });
    const next = setGameLoadout(start, { primary: 'scar-h', secondary: 'desert-eagle' }, 'primary');
    expect(activeWeaponSpec(next).id).toBe('scar-h');
  });
});

describe('Shoot House', () => {
  it('has a clear spawn, clear target spots, and >= 1.9 m clear fall space behind every target', () => {
    expect(shootHouse.targets.length).toBe(14);
    const walls = shootHouse.solids.filter((solid) => solid.material !== 'floor');
    const spots = [shootHouse.spawn.position, ...shootHouse.targets.map((t) => t.position)];
    for (const spot of spots) {
      const body = bodyBox({ ...spot, y: 0.01 }, PLAYER_TUNING.radius, PLAYER_TUNING.height);
      expect(walls.some((solid) => overlaps(body, solid))).toBe(false);
    }

    for (const target of shootHouse.targets) {
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
  });

  it('can be cleared by the bot in steel targets mode with the default loadout', () => {
    const { cleared, shots } = botRun(shootHouse, 'steel', 180);
    expect(cleared).toBe(true);
    expect(shots).toBeLessThanOrEqual(shootHouse.targets.length + 3);
  }, 15_000);

  it('can be cleared by the bot with the Remington 870 shotgun and AWM sniper', () => {
    const shotgun = botRun(shootHouse, 'steel', 180, {
      primary: 'remington-870',
      secondary: 'm1911',
    });
    expect(shotgun.cleared).toBe(true);

    const sniper = botRun(shootHouse, 'steel', 180, { primary: 'awm', secondary: 'desert-eagle' });
    expect(sniper.cleared).toBe(true);
  }, 20_000);

  it('can be won by the bot in firefight mode', () => {
    const result = botRun(shootHouse, 'firefight', 240);
    expect(result.cleared).toBe(true);
    expect(result.state.status).toBe('won');
    expect(result.state.run.kills).toBe(shootHouse.enemySpawns.length);
    expect(result.state.health).toBeGreaterThan(0);
  }, 20_000);
});

function botRun(
  map: GameMap,
  mode: 'firefight' | 'steel',
  seconds: number,
  loadout?: Loadout,
  activeSlot: WeaponSlot = 'primary',
) {
  const bot = createBot(map);
  let state = createGame(map, { mode, ...(loadout ? { loadout } : {}), activeSlot });
  let shots = 0;
  let leaned = false;
  let cleared = false;
  for (let i = 0; i < seconds / dt && !cleared && state.status === 'playing'; i++) {
    const step = stepGame(state, bot(state), dt, map);
    state = step.state;
    for (const event of step.events) {
      if (event.type !== 'shot') continue;
      shots++;
      leaned ||= Math.abs(state.player.lean) > 0.1;
    }
    cleared =
      mode === 'firefight'
        ? state.enemies.every((enemy) => !isEnemyAlive(enemy))
        : state.targetsDown.every(Boolean);
  }
  return { state, cleared, shots, leaned };
}

describe('run telemetry', () => {
  it('holds the timer at zero until the player acts, then tracks time, shots, and accuracy', () => {
    const waiting = run(createGame(range, { mode: 'steel' }), idle, 30, range);
    expect(waiting.state.run.elapsed).toBe(0);
    expect(waiting.state.run.active).toBe(false);
    expect(runAccuracyPercent(waiting.state.run)).toBe(0);

    // Miss one shot high, wait out the fire interval, then knock down the single target.
    const missed = run(waiting.state, { ...idle, pitchDelta: 0.12, fire: true }, 1, range);
    expect(missed.state.run.active).toBe(true);
    expect(missed.state.run.shotsFired).toBe(1);
    expect(missed.state.run.hits).toBe(0);

    const spec = activeWeaponSpec(missed.state);
    const cooled = run(missed.state, idle, Math.ceil(spec.fireInterval / dt), range);
    const reAimed = run(cooled.state, { ...idle, pitchDelta: targetPitch() - 0.12 }, 1, range);
    const cleared = run(reAimed.state, { ...idle, fire: true }, 1, range);

    expect(cleared.state.targetsDown).toEqual([true]);
    expect(cleared.state.status).toBe('won');
    expect(cleared.state.run.active).toBe(false);
    expect(cleared.state.run.shotsFired).toBe(2);
    expect(cleared.state.run.hits).toBe(1);
    expect(runAccuracyPercent(cleared.state.run)).toBe(50);

    const frozenElapsed = cleared.state.run.elapsed;
    expect(frozenElapsed).toBeGreaterThan(0);

    const midCountdown = run(cleared.state, { ...idle, forward: 1, fire: true }, 30, range);
    expect(midCountdown.state.run.elapsed).toBe(frozenElapsed);
    expect(midCountdown.state.run.shotsFired).toBe(2);
    expect(midCountdown.state.run.hits).toBe(1);
  });
});
