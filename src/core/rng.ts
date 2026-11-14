/**
 * A tiny seeded generator. Core never calls `Math.random`; anything that needs variation
 * carries this state instead, so the same seed and the same inputs replay exactly.
 */

export interface Rng {
  readonly seed: number;
  readonly value: number;
}

/** One mulberry32 step. Returns the next state and a number in [0, 1). */
export function nextRandom(seed: number): Rng {
  const state = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { seed: state, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** A signed offset in [-spread, spread). */
export function randomSpread(seed: number, spread: number): Rng {
  const next = nextRandom(seed);
  return { seed: next.seed, value: (next.value * 2 - 1) * spread };
}
