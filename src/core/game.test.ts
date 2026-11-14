import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { bodyBox, overlaps } from './collision';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import {
  activeWeaponSpec,
  createGame,
  runAccuracyPercent,
  setGameLoadout,
  stepGame,
  TARGET,
  targetCentre,
} from './game';
import type { GameMap } from './map';
import { shootHouse } from './maps/shootHouse';
import { eyePosition, NO_INPUT, PLAYER_TUNING } from './player';
import type { Loadout, WeaponSlot } from './weapon';
import { M1911, REMINGTON_870 } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };

/** A bare room: the player at the origin facing one target 10 m away down -Z. */
const range: GameMap = {
  name: 'Test range',
  bounds: { minX: -5, maxX: 5, minZ: -12, maxZ: 5 },
  spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  solids: [
    { min: { x: -5, y: -1, z: -12 }, max: { x: 5, y: 0, z: 5 }, material: 'floor' },
    { min: { x: -5, y: 0, z: -13 }, max: { x: 5, y: 4, z: -12 }, material: 'concrete' },
  ],
  targets: [{ position: { x: 0, y: 0, z: -10 }, facing: { x: 0, z: 1 } }],
};

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

/** Pitch that points the eye at the middle of the test target. */
function pitchToTarget(): number {
  const target = range.targets[0];
  if (!target) throw new Error('no target');
  const eye = eyePosition(createGame(range).player);
  const centre = targetCentre(target);
  return Math.atan2(centre.y - eye.y, eye.z - centre.z);
}

describe('stepGame shooting', () => {
  it('knocks down a target that is shot and marks the hit as steel', () => {
    const aimed = run(createGame(range), { ...idle, pitchDelta: pitchToTarget() }, 1);
    const { state, events } = run(aimed.state, { ...idle, fire: true }, 1);

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
    const { state, events } = run(createGame(range), { ...idle, pitchDelta: 0.1, fire: true }, 1);
    expect(state.targetsDown).toEqual([false]);
    const shot = events.find((event) => event.type === 'shot');
    expect(shot?.hit?.surface).toBe('concrete');
    expect(shot?.hit?.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('sends a second quick shot higher than the first', () => {
    const start = createGame(range, { primary: 'hk416', secondary: 'm1911' }, 'secondary');
    const first = run(start, { ...idle, fire: true }, 1);
    const wait = run(first.state, idle, Math.ceil(M1911.fireInterval / dt));
    const second = run(wait.state, { ...idle, fire: true }, 1);
    const height = (events: GameEvent[]) =>
      events.find((e) => e.type === 'shot')?.hit?.point.y ?? 0;
    expect(height(second.events)).toBeGreaterThan(height(first.events));
  });

  it('fires 8 buckshot pellets from the Remington 870 and keeps accuracy bounded to 100%', () => {
    const shotgunGame = createGame(
      range,
      { primary: 'remington-870', secondary: 'm1911' },
      'primary',
    );
    const aimed = run(shotgunGame, { ...idle, pitchDelta: pitchToTarget() }, 1);
    const { state, events } = run(aimed.state, { ...idle, fire: true }, 1);
    const shot = events.find((e) => e.type === 'shot');
    expect(shot?.hits).toHaveLength(REMINGTON_870.pellets);
    expect(state.targetsDown).toEqual([true]);
    expect(runAccuracyPercent(state.run)).toBe(100);
  });

  it('stands the targets back up after the reset delay', () => {
    const aimed = run(createGame(range), { ...idle, pitchDelta: pitchToTarget() }, 1);
    const down = run(aimed.state, { ...idle, fire: true }, 1);
    expect(down.state.resetIn).toBe(TARGET.resetDelay);

    const later = run(down.state, idle, Math.ceil(TARGET.resetDelay / dt) + 1);
    expect(later.state.targetsDown).toEqual([false]);
    expect(later.events).toContainEqual({ type: 'targets-reset' });
  });

  it('blocks the player with a standing target but not a fallen one', () => {
    const walk = { ...idle, forward: 1 };
    const blocked = run(createGame(range), walk, 240);
    expect(blocked.state.player.position.z).toBeGreaterThan(-10);

    const aimed = run(createGame(range), { ...idle, pitchDelta: pitchToTarget() }, 1);
    const down = run(aimed.state, { ...idle, fire: true }, 1);
    const through = run(down.state, walk, 150);
    expect(through.state.player.position.z).toBeLessThan(-10);
  });
});

describe('Shoot House', () => {
  it('has a clear spawn, clear targets, and >= 1.9 m clear fall space behind every target', () => {
    expect(shootHouse.targets.length).toBe(14);
    const walls = shootHouse.solids.filter((solid) => solid.material !== 'floor');
    const spots = [shootHouse.spawn.position, ...shootHouse.targets.map((t) => t.position)];
    for (const spot of spots) {
      const body = bodyBox({ ...spot, y: 0.01 }, PLAYER_TUNING.radius, PLAYER_TUNING.height);
      expect(walls.some((solid) => overlaps(body, solid))).toBe(false);
    }

    // Verify 1.9 m rear clearance behind each target plate so falling backward never clips.
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

  it('can be cleared by the bot using default HK416 + M1911 loadout', () => {
    const { cleared, shots } = botRun(shootHouse, 180);
    expect(cleared).toBe(true);
    expect(shots).toBeLessThanOrEqual(shootHouse.targets.length + 3);
  }, 15_000);

  it('can be cleared by the bot using the Remington 870 shotgun and AWM sniper', () => {
    const shotgun = botRun(shootHouse, 180, { primary: 'remington-870', secondary: 'm1911' });
    expect(shotgun.cleared).toBe(true);

    const sniper = botRun(shootHouse, 180, { primary: 'awm', secondary: 'desert-eagle' });
    expect(sniper.cleared).toBe(true);
  }, 15_000);
});

function botRun(
  map: GameMap,
  seconds: number,
  loadout?: Loadout,
  activeSlot: WeaponSlot = 'primary',
) {
  const bot = createBot(map);
  let state = createGame(map, loadout, activeSlot);
  let shots = 0;
  let leaned = false;
  let switched = false;
  let cleared = false;
  for (let i = 0; i < seconds / dt && !cleared; i++) {
    const step = stepGame(state, bot(state), dt, map);
    state = step.state;
    for (const event of step.events) {
      if (event.type === 'weapon-switch') switched = true;
      if (event.type !== 'shot') continue;
      shots++;
      leaned ||= Math.abs(state.player.lean) > 0.1;
    }
    cleared = state.targetsDown.every(Boolean);
  }
  return { state, cleared, shots, leaned, switched };
}

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
  const aimAtTarget = { ...idle, pitchDelta: pitchToTarget() };

  it('fires from the leaned eye, so a lean can reach what standing cannot', () => {
    const fire = { ...idle, fire: true };
    const aimed = run(createGame(corner), aimAtTarget, 1, corner).state;
    const straight = run(aimed, fire, 1, corner);
    expect(straight.events.find((e) => e.type === 'shot')?.hit?.surface).toBe('plywood');

    const leaned = run(aimed, { ...idle, lean: 1 }, 30, corner).state;
    expect(run(leaned, { ...fire, lean: 1 }, 1, corner).state.targetsDown).toEqual([true]);
  });

  it('lets the bot lean out and hit a target without stepping from cover', () => {
    const result = botRun(corner, 10);
    expect(result.cleared).toBe(true);
    expect(result.leaned).toBe(true);
    expect(Math.hypot(result.state.player.position.x, result.state.player.position.z)).toBeLessThan(
      0.05,
    );
  });

  it('has the bot aim down the sights before every shot', () => {
    const bot = createBot(range);
    let state = createGame(range);
    for (let i = 0; i < 600 && !state.targetsDown[0]; i++) {
      const input = bot(state);
      if (input.fire) expect(state.weapon.aim).toBe(1);
      state = stepGame(state, input, dt, range).state;
    }
    expect(state.targetsDown).toEqual([true]);
  });

  it('lets the bot switch to its sidearm when dry in front of a target', () => {
    let state = createGame(range, { primary: 'awm', secondary: 'm1911' }, 'primary');
    // Drain the 5-round AWM magazine into the sky so the primary is empty on arrival.
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
    const start = createGame(range);
    const next = setGameLoadout(start, { primary: 'scar-h', secondary: 'desert-eagle' }, 'primary');
    expect(activeWeaponSpec(next).id).toBe('scar-h');
  });
});

describe('run telemetry', () => {
  it('holds the timer at zero until the player acts, then tracks time, shots, and accuracy', () => {
    const waiting = run(createGame(range), idle, 30);
    expect(waiting.state.run.elapsed).toBe(0);
    expect(waiting.state.run.active).toBe(false);
    expect(runAccuracyPercent(waiting.state.run)).toBe(0);

    // Miss one shot high, wait for fire interval, then knock down the single target.
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

    const frozenElapsed = cleared.state.run.elapsed;
    expect(frozenElapsed).toBeGreaterThan(0);

    // During the reset countdown, elapsed time and shot stats stay frozen for the banner.
    const midCountdown = run(cleared.state, { ...idle, forward: 1, fire: true }, 30);
    expect(midCountdown.state.run.elapsed).toBe(frozenElapsed);
    expect(midCountdown.state.run.shotsFired).toBe(2);
    expect(midCountdown.state.run.targetHits).toBe(1);

    // Once targets stand back up, run telemetry resets cleanly for the next run.
    const afterReset = run(midCountdown.state, idle, Math.ceil(TARGET.resetDelay / dt));
    expect(afterReset.state.targetsDown).toEqual([false]);
    expect(afterReset.state.run).toEqual({
      elapsed: 0,
      active: false,
      shotsFired: 0,
      targetHits: 0,
    });
  });
});
