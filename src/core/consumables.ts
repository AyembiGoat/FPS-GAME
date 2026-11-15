/**
 * Healing items, boost items and the boost meter.
 *
 * Pure: takes a state and `dt`, returns the next state and events. The inventory is a fixed set
 * of five integer counts. Every number here is game balance.
 */

export type ConsumableId = 'bandage' | 'first-aid' | 'med-kit' | 'energy-drink' | 'painkiller';
export type ConsumableKind = 'heal' | 'boost';

export interface ConsumableSpec {
  readonly id: ConsumableId;
  readonly name: string;
  readonly shortName: string;
  readonly kind: ConsumableKind;
  /** Seconds the item takes to apply. Its effect lands when the time is up. */
  readonly useTime: number;
  /** Health restored on completion; `null` restores all the way to `healthCap`. */
  readonly healAmount: number | null;
  /** Health above which the item cannot be used and beyond which it never heals. */
  readonly healthCap: number;
  /** Boost points added on completion. */
  readonly boostAmount: number;
  readonly description: string;
}

export const CONSUMABLES: Readonly<Record<ConsumableId, ConsumableSpec>> = {
  bandage: {
    id: 'bandage',
    name: 'Bandage',
    shortName: 'Bandage',
    kind: 'heal',
    useTime: 4,
    healAmount: 10,
    healthCap: 75,
    boostAmount: 0,
    description: 'Restores 10 health in 4 seconds. Cannot heal above 75.',
  },
  'first-aid': {
    id: 'first-aid',
    name: 'First Aid Kit',
    shortName: 'First Aid',
    kind: 'heal',
    useTime: 6,
    healAmount: null,
    healthCap: 75,
    boostAmount: 0,
    description: 'Restores health to 75 in 6 seconds.',
  },
  'med-kit': {
    id: 'med-kit',
    name: 'Med Kit',
    shortName: 'Med Kit',
    kind: 'heal',
    useTime: 8,
    healAmount: null,
    healthCap: 100,
    boostAmount: 0,
    description: 'Restores health to 100 in 8 seconds.',
  },
  'energy-drink': {
    id: 'energy-drink',
    name: 'Energy Drink',
    shortName: 'Energy Drink',
    kind: 'boost',
    useTime: 4,
    healAmount: 0,
    healthCap: 100,
    boostAmount: 40,
    description: 'Adds 40 boost in 4 seconds.',
  },
  painkiller: {
    id: 'painkiller',
    name: 'Painkillers',
    shortName: 'Painkillers',
    kind: 'boost',
    useTime: 6,
    healAmount: 0,
    healthCap: 100,
    boostAmount: 60,
    description: 'Adds 60 boost in 6 seconds.',
  },
};

/** The five inventory slots, in the order the HUD shows them. */
export const CONSUMABLE_ORDER: readonly ConsumableId[] = [
  'bandage',
  'first-aid',
  'med-kit',
  'energy-drink',
  'painkiller',
];

/** Strongest first: what the single "heal" key reaches for. */
export const HEAL_PRIORITY: readonly ConsumableId[] = ['med-kit', 'first-aid', 'bandage'];
/** Strongest first: what the single "boost" key reaches for. */
export const BOOST_PRIORITY: readonly ConsumableId[] = ['painkiller', 'energy-drink'];

export type ConsumableInventory = Readonly<Record<ConsumableId, number>>;

export const EMPTY_CONSUMABLES: ConsumableInventory = {
  bandage: 0,
  'first-aid': 0,
  'med-kit': 0,
  'energy-drink': 0,
  painkiller: 0,
};

/** Most of each item a player may carry. */
export const CONSUMABLE_CARRY_LIMIT = 99;

export const BOOST_TUNING = {
  max: 100,
  /** Boost at or above `threshold` restores `healthPerSecond`. Highest matching tier wins. */
  tiers: [
    { threshold: 75, healthPerSecond: 3.5 },
    { threshold: 25, healthPerSecond: 1.5 },
  ],
  /** Boost points lost per second: one point every 20 seconds. */
  drainPerSecond: 1 / 20,
  /** A boost item is refused while the meter is within this many points of full. */
  fullWithin: 1,
} as const;

export function isConsumableId(value: unknown): value is ConsumableId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONSUMABLES, value);
}

/** Whole, non-negative, capped counts for all five slots; anything else becomes 0. */
export function sanitizeConsumables(candidate: unknown): ConsumableInventory {
  const source: Partial<Record<ConsumableId, unknown>> =
    typeof candidate === 'object' && candidate !== null ? candidate : {};
  const count = (id: ConsumableId): number => {
    const value = source[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(CONSUMABLE_CARRY_LIMIT, Math.max(0, Math.floor(value)));
  };
  return {
    bandage: count('bandage'),
    'first-aid': count('first-aid'),
    'med-kit': count('med-kit'),
    'energy-drink': count('energy-drink'),
    painkiller: count('painkiller'),
  };
}

/** What the player asks for: a specific item, or the best heal or boost they carry. */
export type ConsumableRequest = ConsumableId | 'best-heal' | 'best-boost';

export type ConsumableCancelReason = 'fired' | 'damaged' | 'switched' | 'cap';

export interface ConsumableUse {
  readonly id: ConsumableId;
  /** Seconds left until the item takes effect. */
  readonly remaining: number;
  readonly duration: number;
}

export interface SurvivalState {
  readonly health: number;
  readonly maxHealth: number;
  /** 0..100 boost meter. */
  readonly boost: number;
  readonly inventory: ConsumableInventory;
  readonly use: ConsumableUse | null;
}

export interface SurvivalInput {
  readonly request: ConsumableRequest | null;
  /** The trigger was pulled this tick. */
  readonly fired: boolean;
  /** The player lost health this tick. */
  readonly damaged: boolean;
  /** The player changed weapon this tick. */
  readonly switched: boolean;
}

export type ConsumableEvent =
  | { readonly type: 'consumable-start'; readonly id: ConsumableId; readonly duration: number }
  | {
      readonly type: 'consumable-complete';
      readonly id: ConsumableId;
      readonly health: number;
      readonly boost: number;
    }
  | {
      readonly type: 'consumable-cancel';
      readonly id: ConsumableId;
      readonly reason: ConsumableCancelReason;
    };

/** True when using the item now would do nothing. */
export function consumableAtCap(spec: ConsumableSpec, health: number, boost: number): boolean {
  if (spec.kind === 'boost') return boost > BOOST_TUNING.max - BOOST_TUNING.fullWithin;
  return health >= spec.healthCap;
}

/**
 * Turn a request into a concrete item. A "best" request takes the strongest carried item that
 * would still do something, and falls back to the strongest carried item so the caller can
 * report why nothing happened. Returns `null` when nothing suitable is carried.
 */
export function resolveConsumableRequest(
  request: ConsumableRequest,
  inventory: ConsumableInventory,
  health: number,
  boost: number,
): ConsumableId | null {
  if (request !== 'best-heal' && request !== 'best-boost') {
    return inventory[request] > 0 ? request : null;
  }
  const priority = request === 'best-heal' ? HEAL_PRIORITY : BOOST_PRIORITY;
  let fallback: ConsumableId | null = null;
  for (const id of priority) {
    if (inventory[id] <= 0) continue;
    if (!consumableAtCap(CONSUMABLES[id], health, boost)) return id;
    fallback ??= id;
  }
  return fallback;
}

/** Health restored per second by the current boost level. */
export function boostRegenRate(boost: number): number {
  for (const tier of BOOST_TUNING.tiers) {
    if (boost >= tier.threshold) return tier.healthPerSecond;
  }
  return 0;
}

function applyConsumable(spec: ConsumableSpec, health: number, maxHealth: number): number {
  if (spec.kind !== 'heal') return health;
  const cap = Math.min(maxHealth, spec.healthCap);
  if (health >= cap) return health;
  return spec.healAmount === null ? cap : Math.min(cap, health + spec.healAmount);
}

/**
 * Advance item use, boost drain and boost regeneration by one tick.
 * The caller reports what else happened this tick (`fired`, `damaged`, `switched`).
 */
export function stepSurvival(
  state: SurvivalState,
  input: SurvivalInput,
  dt: number,
): { state: SurvivalState; events: ConsumableEvent[] } {
  const events: ConsumableEvent[] = [];
  let { health, boost, inventory, use } = state;

  // Boost restores health first, then drains.
  const regen = boostRegenRate(boost);
  if (regen > 0 && health > 0 && health < state.maxHealth) {
    health = Math.min(state.maxHealth, health + regen * dt);
  }
  boost = Math.max(0, boost - BOOST_TUNING.drainPerSecond * dt);

  if (use) {
    const spec = CONSUMABLES[use.id];
    const reason: ConsumableCancelReason | null = input.damaged
      ? 'damaged'
      : input.switched
        ? 'switched'
        : input.fired
          ? 'fired'
          : consumableAtCap(spec, health, boost)
            ? 'cap'
            : null;
    if (reason) {
      events.push({ type: 'consumable-cancel', id: use.id, reason });
      use = null;
    } else {
      const remaining = Math.max(0, use.remaining - dt);
      if (remaining === 0) {
        health = applyConsumable(spec, health, state.maxHealth);
        boost = Math.min(BOOST_TUNING.max, boost + spec.boostAmount);
        inventory = { ...inventory, [use.id]: Math.max(0, inventory[use.id] - 1) };
        events.push({ type: 'consumable-complete', id: use.id, health, boost });
        use = null;
      } else {
        use = { ...use, remaining };
      }
    }
  } else if (input.request && health > 0) {
    const id = resolveConsumableRequest(input.request, inventory, health, boost);
    if (id) {
      const spec = CONSUMABLES[id];
      if (consumableAtCap(spec, health, boost)) {
        events.push({ type: 'consumable-cancel', id, reason: 'cap' });
      } else {
        use = { id, remaining: spec.useTime, duration: spec.useTime };
        events.push({ type: 'consumable-start', id, duration: spec.useTime });
      }
    }
  }

  const unchanged =
    health === state.health &&
    boost === state.boost &&
    inventory === state.inventory &&
    use === state.use;
  return {
    state: unchanged ? state : { health, maxHealth: state.maxHealth, boost, inventory, use },
    events,
  };
}
