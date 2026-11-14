import { describe, expect, it } from 'vitest';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, NO_INPUT, PLAYER_TUNING, stepPlayer } from './player';

const dt = SIM_STEP_SECONDS;

function simulate(state: PlayerState, input: PlayerInput, steps: number): PlayerState {
  let current = state;
  for (let i = 0; i < steps; i++) current = stepPlayer(current, input, dt);
  return current;
}

describe('stepPlayer', () => {
  it('stays put with no input', () => {
    const end = simulate(createPlayer(), NO_INPUT, 60);
    expect(end.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(end.grounded).toBe(true);
  });

  it('walks forward down -Z at walk speed', () => {
    const end = simulate(createPlayer(), { ...NO_INPUT, forward: 1 }, 60);
    expect(end.position.z).toBeCloseTo(-PLAYER_TUNING.walkSpeed, 5);
    expect(end.position.x).toBeCloseTo(0, 5);
  });

  it('strafes right along +X when facing -Z', () => {
    const end = simulate(createPlayer(), { ...NO_INPUT, right: 1 }, 60);
    expect(end.position.x).toBeCloseTo(PLAYER_TUNING.walkSpeed, 5);
    expect(end.position.z).toBeCloseTo(0, 5);
  });

  it('moves relative to yaw', () => {
    const turned = stepPlayer(createPlayer(), { ...NO_INPUT, yawDelta: Math.PI / 2 }, 0);
    const end = simulate(turned, { ...NO_INPUT, forward: 1 }, 60);
    expect(end.position.x).toBeCloseTo(-PLAYER_TUNING.walkSpeed, 5);
    expect(end.position.z).toBeCloseTo(0, 5);
  });

  it('does not move faster diagonally', () => {
    const end = stepPlayer(createPlayer(), { ...NO_INPUT, forward: 1, right: 1 }, dt);
    expect(Math.hypot(end.velocity.x, end.velocity.z)).toBeCloseTo(PLAYER_TUNING.walkSpeed, 5);
  });

  it('sprints faster than it walks', () => {
    const end = stepPlayer(createPlayer(), { ...NO_INPUT, forward: 1, sprint: true }, dt);
    expect(Math.hypot(end.velocity.x, end.velocity.z)).toBeCloseTo(PLAYER_TUNING.sprintSpeed, 5);
  });

  it('jumps, leaves the ground, and lands again', () => {
    const launched = stepPlayer(createPlayer(), { ...NO_INPUT, jump: true }, dt);
    expect(launched.grounded).toBe(false);
    expect(launched.position.y).toBeGreaterThan(0);

    const landed = simulate(launched, NO_INPUT, 120);
    expect(landed.grounded).toBe(true);
    expect(landed.position.y).toBe(0);
  });

  it('cannot jump again while airborne', () => {
    const airborne = simulate(createPlayer(), { ...NO_INPUT, jump: true }, 5);
    const next = stepPlayer(airborne, { ...NO_INPUT, jump: true }, dt);
    expect(next.velocity.y).toBeLessThan(airborne.velocity.y);
  });

  it('clamps pitch short of straight up and down', () => {
    const up = stepPlayer(createPlayer(), { ...NO_INPUT, pitchDelta: 10 }, dt);
    const down = stepPlayer(createPlayer(), { ...NO_INPUT, pitchDelta: -10 }, dt);
    expect(up.pitch).toBe(PLAYER_TUNING.maxPitch);
    expect(down.pitch).toBe(-PLAYER_TUNING.maxPitch);
  });

  it('is deterministic', () => {
    const input = { ...NO_INPUT, forward: 1, right: -0.5, yawDelta: 0.01, jump: true };
    expect(simulate(createPlayer(), input, 200)).toEqual(simulate(createPlayer(), input, 200));
  });
});
