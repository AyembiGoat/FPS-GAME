import { describe, expect, it } from 'vitest';
import type { Box } from './collision';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, NO_INPUT, PLAYER_TUNING, stepPlayer } from './player';

const dt = SIM_STEP_SECONDS;
const T = PLAYER_TUNING;

const floor: Box = { min: { x: -100, y: -1, z: -100 }, max: { x: 100, y: 0, z: 100 } };
/** A wall across the player's path at z = -2. */
const wall: Box = { min: { x: -100, y: 0, z: -3 }, max: { x: 100, y: 3, z: -2 } };
const ledge: Box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } };

function simulate(
  state: PlayerState,
  input: PlayerInput,
  steps: number,
  solids: readonly Box[] = [floor],
): PlayerState {
  let current = state;
  for (let i = 0; i < steps; i++) current = stepPlayer(current, input, dt, solids).state;
  return current;
}

function horizontalSpeed(state: PlayerState): number {
  return Math.hypot(state.velocity.x, state.velocity.z);
}

describe('stepPlayer movement', () => {
  it('stays put with no input', () => {
    const end = simulate(createPlayer(), NO_INPUT, 60);
    expect(end.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(end.grounded).toBe(true);
  });

  it.each([
    ['forward', { forward: 1 }, 0, -1],
    ['back', { forward: -1 }, 0, 1],
    ['right', { right: 1 }, 1, 0],
    ['left', { right: -1 }, -1, 0],
  ])('moves %s relative to facing -Z', (_, input, x, z) => {
    const end = simulate(createPlayer(), { ...NO_INPUT, ...input }, 30);
    expect(end.velocity.x).toBeCloseTo(x * T.walkSpeed, 5);
    expect(end.velocity.z).toBeCloseTo(z * T.walkSpeed, 5);
  });

  it('moves relative to yaw', () => {
    const input = { ...NO_INPUT, forward: 1 };
    const turned = stepPlayer(createPlayer(), { ...NO_INPUT, yawDelta: Math.PI / 2 }, dt, [floor]);
    const end = simulate(turned.state, input, 30);
    expect(end.velocity.x).toBeCloseTo(-T.walkSpeed, 5);
    expect(end.velocity.z).toBeCloseTo(0, 5);
  });

  it('reaches full speed quickly and stops quickly', () => {
    const running = simulate(createPlayer(), { ...NO_INPUT, forward: 1 }, 6);
    expect(horizontalSpeed(running)).toBeCloseTo(T.walkSpeed, 5);
    const stopped = simulate(running, NO_INPUT, 7);
    expect(horizontalSpeed(stopped)).toBe(0);
  });

  it('does not move faster diagonally', () => {
    const end = simulate(createPlayer(), { ...NO_INPUT, forward: 1, right: 1 }, 30);
    expect(horizontalSpeed(end)).toBeCloseTo(T.walkSpeed, 5);
  });

  it('sprints forward but not backward', () => {
    const forward = simulate(createPlayer(), { ...NO_INPUT, forward: 1, sprint: true }, 30);
    const backward = simulate(createPlayer(), { ...NO_INPUT, forward: -1, sprint: true }, 30);
    expect(horizontalSpeed(forward)).toBeCloseTo(T.sprintSpeed, 5);
    expect(horizontalSpeed(backward)).toBeCloseTo(T.walkSpeed, 5);
  });

  it('clamps pitch short of straight up and down', () => {
    const up = stepPlayer(createPlayer(), { ...NO_INPUT, pitchDelta: 10 }, dt, [floor]).state;
    const down = stepPlayer(createPlayer(), { ...NO_INPUT, pitchDelta: -10 }, dt, [floor]).state;
    expect(up.pitch).toBe(T.maxPitch);
    expect(down.pitch).toBe(-T.maxPitch);
  });

  it('is deterministic', () => {
    const input = { ...NO_INPUT, forward: 1, right: -0.5, yawDelta: 0.01, jump: true };
    expect(simulate(createPlayer(), input, 200)).toEqual(simulate(createPlayer(), input, 200));
  });
});

describe('stepPlayer collision', () => {
  it('stops at a wall', () => {
    const end = simulate(createPlayer(), { ...NO_INPUT, forward: 1 }, 120, [floor, wall]);
    expect(end.position.z).toBeCloseTo(-2 + T.radius, 5);
    expect(end.velocity.z).toBe(0);
  });

  it('slides along a wall when moving into it at an angle', () => {
    const end = simulate(createPlayer(), { ...NO_INPUT, forward: 1, right: 1 }, 120, [floor, wall]);
    expect(end.position.z).toBeCloseTo(-2 + T.radius, 5);
    expect(end.position.x).toBeGreaterThan(5);
  });

  it('falls onto the floor and reports the landing', () => {
    let state = { ...createPlayer({ x: 0, y: 3, z: 0 }), grounded: false, coyote: 0 };
    let landed: number | null = null;
    for (let i = 0; i < 120 && landed === null; i++) {
      const step = stepPlayer(state, NO_INPUT, dt, [floor]);
      state = step.state;
      landed = step.landedSpeed;
    }
    expect(state.position.y).toBe(0);
    expect(state.grounded).toBe(true);
    expect(landed).toBeGreaterThan(5);
  });

  it('stands on top of a solid', () => {
    const end = simulate(createPlayer({ x: 0, y: 2, z: 0 }), NO_INPUT, 120, [floor, ledge]);
    expect(end.position.y).toBe(1);
    expect(end.grounded).toBe(true);
  });
});

describe('stepPlayer jumping', () => {
  const jump = { ...NO_INPUT, jump: true };

  it('rises to the expected height and lands again', () => {
    let state = createPlayer();
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      state = stepPlayer(state, i === 0 ? jump : NO_INPUT, dt, [floor]).state;
      peak = Math.max(peak, state.position.y);
    }
    // Stepping at 60 Hz lands slightly under the ideal arc.
    expect(Math.abs(peak - T.jumpSpeed ** 2 / (2 * T.gravity))).toBeLessThan(0.06);
    expect(state.grounded).toBe(true);
  });

  it('does not jump again while the key stays held', () => {
    let jumps = 0;
    let state = createPlayer();
    for (let i = 0; i < 240; i++) {
      const step = stepPlayer(state, jump, dt, [floor]);
      state = step.state;
      if (step.jumped) jumps++;
    }
    expect(jumps).toBe(1);
  });

  it('cannot jump in mid-air', () => {
    const airborne = simulate(createPlayer(), jump, 15);
    const released = simulate(airborne, NO_INPUT, 1);
    expect(stepPlayer(released, jump, dt, [floor]).jumped).toBe(false);
  });

  it('still jumps just after walking off a ledge', () => {
    const onLedge = simulate(createPlayer({ x: 0, y: 1, z: 0 }), NO_INPUT, 2, [floor, ledge]);
    // Walk until the floor is no longer under the player.
    let state = onLedge;
    while (state.grounded) {
      state = stepPlayer(state, { ...NO_INPUT, forward: 1 }, dt, [floor, ledge]).state;
    }
    expect(stepPlayer(state, jump, dt, [floor, ledge]).jumped).toBe(true);

    const tooLate = simulate(state, NO_INPUT, Math.ceil(T.coyoteTime / dt) + 1, [floor, ledge]);
    expect(stepPlayer(tooLate, jump, dt, [floor, ledge]).jumped).toBe(false);
  });

  it('remembers a jump pressed just before landing', () => {
    // Find the step on which a falling player lands, then press jump slightly earlier.
    const start = { ...createPlayer({ x: 0, y: 1, z: 0 }), grounded: false, coyote: 0 };
    let probe = start;
    let landingStep = 0;
    while (!probe.grounded) {
      probe = stepPlayer(probe, NO_INPUT, dt, [floor]).state;
      landingStep++;
    }

    let state = start;
    let jumped = false;
    for (let i = 0; i < landingStep + 5; i++) {
      const early = i === landingStep - 3;
      const step = stepPlayer(state, early ? jump : NO_INPUT, dt, [floor]);
      state = step.state;
      jumped ||= step.jumped;
    }
    expect(jumped).toBe(true);
  });
});
