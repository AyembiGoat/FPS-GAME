/**
 * Pure deterministic 32-bit PRNG (Mulberry32).
 * Returns next state explicitly so simulation stepping has zero hidden mutable globals.
 */

export interface RngStep {
  readonly value: number;
  readonly state: number;
}

export function normalizeSeed(seed: number): number {
  const n = seed | 0;
  return n === 0 ? 0x6d2b79f5 : n >>> 0;
}

/** Advance 32-bit unsigned PRNG state and return a float in [0, 1). */
export function nextRandom(state: number): RngStep {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** Stateful wrapper convenient inside a single deterministic tick before writing `state` back. */
export interface SeededRng {
  next(): number;
  range(min: number, max: number): number;
  signed(): number;
  int(minInclusive: number, maxInclusive: number): number;
  getState(): number;
}

export function createSeededRng(initialSeed: number): SeededRng {
  let state = normalizeSeed(initialSeed);
  return {
    next() {
      const step = nextRandom(state);
      state = step.state;
      return step.value;
    },
    range(min: number, max: number) {
      const step = nextRandom(state);
      state = step.state;
      return min + (max - min) * step.value;
    },
    signed() {
      const step = nextRandom(state);
      state = step.state;
      return step.value * 2 - 1;
    },
    int(minInclusive: number, maxInclusive: number) {
      const step = nextRandom(state);
      state = step.state;
      const span = Math.max(1, maxInclusive - minInclusive + 1);
      return minInclusive + Math.floor(step.value * span);
    },
    getState() {
      return state;
    },
  };
}
