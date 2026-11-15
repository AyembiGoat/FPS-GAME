import { describe, expect, it } from 'vitest';
import type { ConsumableEvent, SurvivalInput, SurvivalState } from './consumables';
import {
  BOOST_TUNING,
  boostRegenRate,
  CONSUMABLE_ORDER,
  CONSUMABLES,
  EMPTY_CONSUMABLES,
  resolveConsumableRequest,
  sanitizeConsumables,
  stepSurvival,
} from './consumables';
import { SIM_STEP_SECONDS } from './fixedLoop';

const dt = SIM_STEP_SECONDS;
const quiet: SurvivalInput = { request: null, fired: false, damaged: false, switched: false };
const stocked = { bandage: 3, 'first-aid': 2, 'med-kit': 1, 'energy-drink': 2, painkiller: 1 };

function survivor(health: number, boost = 0, inventory = stocked): SurvivalState {
  return { health, maxHealth: 100, boost, inventory, use: null };
}

function run(state: SurvivalState, input: SurvivalInput, seconds: number) {
  const events: ConsumableEvent[] = [];
  let current = state;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    const step = stepSurvival(current, i === 0 ? input : quiet, dt);
    current = step.state;
    events.push(...step.events);
  }
  return { state: current, events };
}

describe('consumable catalogue', () => {
  it('is a fixed set of five items with the agreed timings', () => {
    expect([...CONSUMABLE_ORDER]).toEqual([
      'bandage',
      'first-aid',
      'med-kit',
      'energy-drink',
      'painkiller',
    ]);
    expect(CONSUMABLES.bandage).toMatchObject({ useTime: 4, healAmount: 10, healthCap: 75 });
    expect(CONSUMABLES['first-aid']).toMatchObject({ useTime: 6, healAmount: null, healthCap: 75 });
    expect(CONSUMABLES['med-kit']).toMatchObject({ useTime: 8, healAmount: null, healthCap: 100 });
    expect(CONSUMABLES['energy-drink']).toMatchObject({ useTime: 4, boostAmount: 40 });
    expect(CONSUMABLES.painkiller).toMatchObject({ useTime: 6, boostAmount: 60 });
  });

  it('keeps inventory counts whole, non-negative and complete', () => {
    expect(sanitizeConsumables(undefined)).toEqual(EMPTY_CONSUMABLES);
    expect(sanitizeConsumables({ bandage: 2.9, 'med-kit': -4, painkiller: 'x', other: 3 })).toEqual(
      {
        ...EMPTY_CONSUMABLES,
        bandage: 2,
      },
    );
  });
});

describe('healing items', () => {
  it('applies a bandage after 4 seconds: +10 health and one fewer carried', () => {
    const early = run(survivor(40), { ...quiet, request: 'bandage' }, 3.9);
    expect(early.state.health).toBe(40);
    expect(early.state.use?.id).toBe('bandage');
    expect(early.events).toEqual([{ type: 'consumable-start', id: 'bandage', duration: 4 }]);

    const done = run(early.state, quiet, 0.2);
    expect(done.state.health).toBe(50);
    expect(done.state.use).toBeNull();
    expect(done.state.inventory.bandage).toBe(2);
    expect(done.events).toEqual([
      { type: 'consumable-complete', id: 'bandage', health: 50, boost: 0 },
    ]);
  });

  it('never lets a bandage heal past 75', () => {
    expect(run(survivor(70), { ...quiet, request: 'bandage' }, 4.1).state.health).toBe(75);
  });

  it('heals to 75 with a first aid kit in 6 seconds and to 100 with a med kit in 8', () => {
    const aid = run(survivor(12), { ...quiet, request: 'first-aid' }, 6.1);
    expect(aid.state.health).toBe(75);
    expect(aid.state.inventory['first-aid']).toBe(1);

    const tooSoon = run(survivor(12), { ...quiet, request: 'med-kit' }, 7.9);
    expect(tooSoon.state.health).toBe(12);
    const kit = run(survivor(12), { ...quiet, request: 'med-kit' }, 8.1);
    expect(kit.state.health).toBe(100);
    expect(kit.state.inventory['med-kit']).toBe(0);
  });

  it('refuses an item that would do nothing and says why', () => {
    const capped = stepSurvival(survivor(80), { ...quiet, request: 'bandage' }, dt);
    expect(capped.state.use).toBeNull();
    expect(capped.state.inventory.bandage).toBe(3);
    expect(capped.events).toEqual([{ type: 'consumable-cancel', id: 'bandage', reason: 'cap' }]);

    const full = stepSurvival(survivor(100), { ...quiet, request: 'med-kit' }, dt);
    expect(full.events).toEqual([{ type: 'consumable-cancel', id: 'med-kit', reason: 'cap' }]);
  });

  it('does nothing when the item is not carried', () => {
    const none = stepSurvival(
      survivor(30, 0, EMPTY_CONSUMABLES),
      { ...quiet, request: 'med-kit' },
      dt,
    );
    expect(none.events).toEqual([]);
    expect(none.state.use).toBeNull();
  });

  it('is cancelled by firing, taking damage or switching weapon, and keeps the item', () => {
    for (const reason of ['fired', 'damaged', 'switched'] as const) {
      const started = run(survivor(30), { ...quiet, request: 'first-aid' }, 2).state;
      const cancelled = stepSurvival(started, { ...quiet, [reason]: true }, dt);
      expect(cancelled.events).toEqual([{ type: 'consumable-cancel', id: 'first-aid', reason }]);
      expect(cancelled.state.use).toBeNull();
      expect(cancelled.state.health).toBe(30);
      expect(cancelled.state.inventory['first-aid']).toBe(2);
    }
  });

  it('picks the strongest carried heal that would still help', () => {
    expect(resolveConsumableRequest('best-heal', stocked, 40, 0)).toBe('med-kit');
    expect(resolveConsumableRequest('best-heal', { ...stocked, 'med-kit': 0 }, 40, 0)).toBe(
      'first-aid',
    );
    expect(
      resolveConsumableRequest('best-heal', { ...stocked, 'med-kit': 0, 'first-aid': 0 }, 40, 0),
    ).toBe('bandage');
    // Above 75 only the med kit still helps.
    expect(resolveConsumableRequest('best-heal', stocked, 80, 0)).toBe('med-kit');
    expect(resolveConsumableRequest('best-heal', { ...stocked, 'med-kit': 0 }, 80, 0)).toBe(
      'first-aid',
    );
    expect(resolveConsumableRequest('best-heal', EMPTY_CONSUMABLES, 40, 0)).toBeNull();
    expect(resolveConsumableRequest('best-boost', stocked, 40, 0)).toBe('painkiller');
    expect(resolveConsumableRequest('best-boost', { ...stocked, painkiller: 0 }, 40, 0)).toBe(
      'energy-drink',
    );
  });
});

describe('boost', () => {
  it('adds 40 from an energy drink in 4 seconds and 60 from painkillers in 6', () => {
    const drink = run(survivor(100), { ...quiet, request: 'energy-drink' }, 4.1);
    expect(drink.events.at(-1)).toMatchObject({ type: 'consumable-complete', boost: 40 });
    expect(drink.state.inventory['energy-drink']).toBe(1);

    const pills = run(survivor(100), { ...quiet, request: 'painkiller' }, 6.1);
    expect(pills.events.at(-1)).toMatchObject({ type: 'consumable-complete', boost: 60 });
  });

  it('caps at 100 and refuses a boost item when already full', () => {
    const topped = run(survivor(100, 80), { ...quiet, request: 'painkiller' }, 6.1);
    expect(topped.state.boost).toBeLessThanOrEqual(BOOST_TUNING.max);
    expect(topped.state.boost).toBeGreaterThan(99);
    const full = stepSurvival(survivor(100, 100), { ...quiet, request: 'energy-drink' }, dt);
    expect(full.events).toEqual([{ type: 'consumable-cancel', id: 'energy-drink', reason: 'cap' }]);
  });

  it('restores nothing below 25, 1.5 health per second from 25 and 3.5 from 75', () => {
    expect(boostRegenRate(0)).toBe(0);
    expect(boostRegenRate(24.9)).toBe(0);
    expect(boostRegenRate(25)).toBe(1.5);
    expect(boostRegenRate(74.9)).toBe(1.5);
    expect(boostRegenRate(75)).toBe(3.5);
    expect(boostRegenRate(100)).toBe(3.5);

    expect(run(survivor(50, 20), quiet, 2).state.health).toBe(50);
    expect(run(survivor(50, 50), quiet, 2).state.health).toBeCloseTo(53, 6);
    expect(run(survivor(50, 90), quiet, 2).state.health).toBeCloseTo(57, 6);
    expect(run(survivor(99, 90), quiet, 2).state.health).toBe(100);
    expect(run(survivor(0, 90), quiet, 2).state.health).toBe(0);
  });

  it('drains one point every 20 seconds', () => {
    expect(run(survivor(100, 60), quiet, 20).state.boost).toBeCloseTo(59, 6);
    expect(run(survivor(100, 0.01), quiet, 20).state.boost).toBe(0);
  });
});
