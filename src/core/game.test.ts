import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { bodyBox, overlaps } from './collision';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import { createGame, runAccuracyPercent, stepGame, TARGET, targetCentre, WEAPON } from './game';
import type { GameMap } from './map';
import { shootHouse } from './maps/shootHouse';
import { eyePosition, NO_INPUT, PLAYER_TUNING } from './player';

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
  });

  it('hits the wall behind when the shot goes over the target', () => {
    const { state, events } = run(createGame(range), { ...idle, pitchDelta: 0.1, fire: true }, 1);
    expect(state.targetsDown).toEqual([false]);
    const shot = events.find((event) => event.type === 'shot');
    expect(shot?.hit?.surface).toBe('concrete');
    expect(shot?.hit?.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('sends a second quick shot higher than the first', () => {
    const first = run(createGame(range), { ...idle, fire: true }, 1);
    const wait = run(first.state, idle, Math.ceil(WEAPON.fireInterval / dt));
    const second = run(wait.state, { ...idle, fire: true }, 1);
    const height = (events: GameEvent[]) =>
      events.find((e) => e.type === 'shot')?.hit?.point.y ?? 0;
    expect(height(second.events)).toBeGreaterThan(height(first.events));
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
  it('has a clear spawn and clear targets', () => {
    const walls = shootHouse.solids.filter((solid) => solid.material !== 'floor');
    const spots = [shootHouse.spawn.position, ...shootHouse.targets.map((t) => t.position)];
    for (const spot of spots) {
      const body = bodyBox({ ...spot, y: 0.01 }, PLAYER_TUNING.radius, PLAYER_TUNING.height);
      expect(walls.some((solid) => overlaps(body, solid))).toBe(false);
    }
  });

  it('can be cleared by the bot using only player inputs', () => {
    const { cleared, shots } = botRun(shootHouse, 180);
    expect(cleared).toBe(true);
    // The bot only fires when on target, so it should not need many spare rounds.
    expect(shots).toBeLessThanOrEqual(shootHouse.targets.length + 2);
  });
});

function botRun(map: GameMap, seconds: number) {
  const bot = createBot(map);
  let state = createGame(map);
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
    cleared = state.targetsDown.every(Boolean);
  }
  return { state, cleared, shots, leaned };
}

describe('leaning and aiming in play', () => {
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

    const cooled = run(missed.state, idle, Math.ceil(WEAPON.fireInterval / dt));
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
