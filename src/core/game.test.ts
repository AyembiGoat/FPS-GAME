import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { bodyBox, overlaps } from './collision';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import { createGame, stepGame, TARGET, targetCentre } from './game';
import type { GameMap } from './map';
import { shootHouse } from './maps/shootHouse';
import { eyePosition, NO_INPUT, PLAYER_TUNING } from './player';
import { M1911 } from './weapon';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false };

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
    const wait = run(first.state, idle, Math.ceil(M1911.fireInterval / dt));
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
    const bot = createBot(shootHouse);
    let state = createGame(shootHouse);
    let shots = 0;
    let cleared = false;
    const limit = 120 / dt;
    for (let i = 0; i < limit && !cleared; i++) {
      const step = stepGame(state, bot(state), dt, shootHouse);
      state = step.state;
      shots += step.events.filter((event) => event.type === 'shot').length;
      cleared = state.targetsDown.every(Boolean);
    }
    expect(cleared).toBe(true);
    // The bot only fires when on target, so it should not need many spare rounds.
    expect(shots).toBeLessThanOrEqual(shootHouse.targets.length + 2);
  });
});
