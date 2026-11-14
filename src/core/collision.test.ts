import { describe, expect, it } from 'vitest';
import type { Box } from './collision';
import { raycast } from './collision';

const near: Box = { min: { x: -1, y: 0, z: -5 }, max: { x: 1, y: 2, z: -4 } };
const far: Box = { min: { x: -1, y: 0, z: -9 }, max: { x: 1, y: 2, z: -8 } };
const forward = { x: 0, y: 0, z: -1 };
const origin = { x: 0, y: 1, z: 0 };

describe('raycast', () => {
  it('returns the nearest box, its distance and the face normal', () => {
    expect(raycast(origin, forward, 100, [far, near])).toEqual({
      distance: 4,
      index: 1,
      normal: { x: 0, y: 0, z: 1 },
    });
  });

  it('misses when aimed away, past the side, or out of range', () => {
    expect(raycast(origin, { x: 0, y: 0, z: 1 }, 100, [near])).toBeNull();
    expect(raycast({ x: 1.5, y: 1, z: 0 }, forward, 100, [near])).toBeNull();
    expect(raycast(origin, forward, 3.9, [near])).toBeNull();
  });

  it('ignores a box the ray starts inside', () => {
    expect(raycast({ x: 0, y: 1, z: -4.5 }, forward, 100, [near])).toBeNull();
  });

  it('reports the side face when hit at an angle', () => {
    const direction = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
    const hit = raycast({ x: -5.5, y: 1, z: 0 }, direction, 100, [near]);
    expect(hit?.normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(hit?.distance).toBeCloseTo(4.5 * Math.SQRT2, 5);
  });
});
