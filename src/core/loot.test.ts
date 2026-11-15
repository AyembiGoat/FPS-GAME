import { describe, expect, it } from 'vitest';
import { collidesAt } from './collision';
import { CONSUMABLE_CARRY_LIMIT, EMPTY_CONSUMABLES } from './consumables';
import { ARMOUR_TUNING, createArmour, NO_ARMOUR } from './damage';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameInput, GameState } from './game';
import { createGame, stepGame } from './game';
import type { LootItem, LootSpawn } from './loot';
import { applyLoot, LOOT_TUNING, lootName, lootRefusal, nearestLoot } from './loot';
import type { GameMap } from './map';
import { MAP_LIST } from './maps';
import { testDummyRange } from './maps/testDummyRange';
import { GAME_MODE_LIST } from './modes';
import { cellCenter, computeReachableMask, getNavGrid } from './nav';
import { NO_INPUT } from './player';

const dt = SIM_STEP_SECONDS;
const idle: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };
const bandages: LootItem = { kind: 'consumable', id: 'bandage', count: 5 };
const vest = (level: 1 | 2 | 3): LootItem => ({ kind: 'armour', piece: 'vest', level });
const helmet = (level: 1 | 2 | 3): LootItem => ({ kind: 'armour', piece: 'helmet', level });

describe('taking an item', () => {
  it('adds a stack to what is carried, up to the carry limit', () => {
    const picked = applyLoot(bandages, { ...EMPTY_CONSUMABLES, bandage: 2 }, NO_ARMOUR);
    expect(picked.inventory.bandage).toBe(7);
    expect(picked.armour).toBe(NO_ARMOUR);

    const nearlyFull = { ...EMPTY_CONSUMABLES, bandage: CONSUMABLE_CARRY_LIMIT - 1 };
    expect(lootRefusal(bandages, nearlyFull, NO_ARMOUR)).toBeNull();
    expect(applyLoot(bandages, nearlyFull, NO_ARMOUR).inventory.bandage).toBe(
      CONSUMABLE_CARRY_LIMIT,
    );
    const full = { ...EMPTY_CONSUMABLES, bandage: CONSUMABLE_CARRY_LIMIT };
    expect(lootRefusal(bandages, full, NO_ARMOUR)).toBe('carry-limit');
  });

  it('puts armour on undamaged and leaves the other piece alone', () => {
    const worn = createArmour(0, 1);
    const picked = applyLoot(vest(2), EMPTY_CONSUMABLES, worn);
    expect(picked.armour).toEqual({
      vest: 2,
      vestDurability: ARMOUR_TUNING.vestDurability[2],
      helmet: 1,
      helmetDurability: ARMOUR_TUNING.helmetDurability[1],
    });
    expect(applyLoot(helmet(3), EMPTY_CONSUMABLES, worn).armour.helmetDurability).toBe(
      ARMOUR_TUNING.helmetDurability[3],
    );
  });

  it('only swaps armour for a higher level or an undamaged piece of the same level', () => {
    const fresh = createArmour(2, 2);
    expect(lootRefusal(vest(3), EMPTY_CONSUMABLES, fresh)).toBeNull();
    expect(lootRefusal(vest(2), EMPTY_CONSUMABLES, fresh)).toBe('wearing-better');
    expect(lootRefusal(vest(1), EMPTY_CONSUMABLES, fresh)).toBe('wearing-better');

    const dented = { ...fresh, vestDurability: fresh.vestDurability - 1 };
    expect(lootRefusal(vest(2), EMPTY_CONSUMABLES, dented)).toBeNull();
    expect(lootRefusal(vest(1), EMPTY_CONSUMABLES, dented)).toBe('wearing-better');
    // The helmet is still whole, so the same level is no improvement.
    expect(lootRefusal(helmet(2), EMPTY_CONSUMABLES, dented)).toBe('wearing-better');
    // A broken piece drops to level 0, so anything replaces it.
    expect(lootRefusal(vest(1), EMPTY_CONSUMABLES, NO_ARMOUR)).toBeNull();
  });

  it('names items the way the player reads them', () => {
    expect(lootName(bandages)).toBe('Bandage');
    expect(lootName(vest(2))).toBe('Vest (Level 2)');
    expect(lootName(helmet(1))).toBe('Helmet (Level 1)');
  });
});

describe('what is within reach', () => {
  const at = (id: string, x: number, y: number, z: number): LootSpawn => ({
    id,
    item: bandages,
    position: { x, y, z },
  });
  const feet = { x: 0, y: 0, z: 0 };

  it('picks the closest item still lying there', () => {
    const spawns = [at('far', 1.5, 0, 0), at('near', 0, 0, 0.6), at('gone', 0.1, 0, 0)];
    expect(nearestLoot(spawns, [false, false, true], feet)).toBe(1);
    expect(nearestLoot(spawns, [false, true, true], feet)).toBe(0);
    expect(nearestLoot(spawns, [true, true, true], feet)).toBeNull();
  });

  it('stops at the reach distance and ignores items too far above or below', () => {
    const reach = LOOT_TUNING.reach;
    expect(nearestLoot([at('edge', reach, 0, 0)], [false], feet)).toBe(0);
    expect(nearestLoot([at('past', reach + 0.01, 0, 0)], [false], feet)).toBeNull();
    expect(nearestLoot([at('shelf', 0.5, LOOT_TUNING.reachAbove, 0)], [false], feet)).toBe(0);
    expect(
      nearestLoot([at('roof', 0.5, LOOT_TUNING.reachAbove + 0.1, 0)], [false], feet),
    ).toBeNull();
    expect(
      nearestLoot([at('pit', 0.5, -LOOT_TUNING.reachBelow - 0.1, 0)], [false], feet),
    ).toBeNull();
  });

  it('keeps the first of two items at the same distance', () => {
    expect(nearestLoot([at('a', 1, 0, 0), at('b', -1, 0, 0)], [false, false], feet)).toBe(0);
  });
});

describe('picking up in play', () => {
  const spawn = testDummyRange.spawn.position;
  const arena: GameMap = {
    ...testDummyRange,
    targets: [],
    enemies: [],
    loot: [
      { id: 'bandages', item: bandages, position: { x: spawn.x + 1, y: 0, z: spawn.z } },
      { id: 'vest', item: vest(1), position: { x: spawn.x, y: 0, z: spawn.z - 6 } },
    ],
  };
  const start = (): GameState => createGame(arena, undefined, 'primary', { mode: 'gungame' });
  const step = (state: GameState, input: GameInput) => stepGame(state, input, dt, arena);

  it('starts every mode with no armour and no items', () => {
    for (const mode of GAME_MODE_LIST) {
      for (const map of MAP_LIST) {
        const state = createGame(map, undefined, 'primary', { mode: mode.id });
        expect(state.playerArmour).toEqual(NO_ARMOUR);
        expect(state.consumables).toEqual(EMPTY_CONSUMABLES);
        expect(state.playerBoost).toBe(0);
        expect(state.lootTaken).toHaveLength(mode.usesLoot ? (map.loot?.length ?? 0) : 0);
      }
    }
  });

  it('shows the item in reach, then takes it when asked', () => {
    const seen = step(start(), idle);
    expect(seen.state.nearbyLoot).toBe(0);
    expect(seen.state.nearbyLootRefusal).toBeNull();
    expect(seen.events).toEqual([]);

    const taken = step(seen.state, { ...idle, interact: true });
    expect(taken.events).toEqual([{ type: 'loot-taken', index: 0, item: bandages }]);
    expect(taken.state.consumables.bandage).toBe(5);
    expect(taken.state.lootTaken).toEqual([true, false]);
    expect(taken.state.nearbyLoot).toBeNull();

    // Nothing left in reach: the key does nothing.
    const again = step(taken.state, { ...idle, interact: true });
    expect(again.events).toEqual([]);
    expect(again.state.consumables.bandage).toBe(5);
  });

  it('does nothing when the key is pressed with nothing in reach', () => {
    const away: GameState = {
      ...start(),
      player: { ...start().player, position: { x: spawn.x, y: 0, z: spawn.z - 3 } },
    };
    const pressed = step(step(away, idle).state, { ...idle, interact: true });
    expect(pressed.events).toEqual([]);
    expect(pressed.state.lootTaken).toEqual([false, false]);
  });

  it('refuses armour that is no better than what is worn, and leaves it lying', () => {
    const base = createGame(arena, undefined, 'primary', { mode: 'gungame', vest: 2 });
    const beside: GameState = {
      ...base,
      player: { ...base.player, position: { x: spawn.x, y: 0, z: spawn.z - 5.5 } },
    };
    const seen = step(beside, idle);
    expect(seen.state.nearbyLoot).toBe(1);
    expect(seen.state.nearbyLootRefusal).toBe('wearing-better');

    const pressed = step(seen.state, { ...idle, interact: true });
    expect(pressed.events).toEqual([{ type: 'loot-refused', index: 1, reason: 'wearing-better' }]);
    expect(pressed.state.lootTaken).toEqual([false, false]);
    expect(pressed.state.playerArmour.vest).toBe(2);
  });

  it('puts a picked-up vest on', () => {
    const base = start();
    const beside: GameState = {
      ...base,
      player: { ...base.player, position: { x: spawn.x, y: 0, z: spawn.z - 5.5 } },
    };
    const taken = step(step(beside, idle).state, { ...idle, interact: true });
    expect(taken.state.playerArmour.vest).toBe(1);
    expect(taken.state.playerArmour.vestDurability).toBe(ARMOUR_TUNING.vestDurability[1]);
  });

  it('lays no loot in modes that do not use it, and puts it back on a new run', () => {
    const practice = createGame(arena, undefined, 'primary', { mode: 'practice' });
    const pressed = step(step(practice, idle).state, { ...idle, interact: true });
    expect(pressed.state.nearbyLoot).toBeNull();
    expect(pressed.events).toEqual([]);

    const taken = step(step(start(), idle).state, { ...idle, interact: true });
    expect(taken.state.lootTaken[0]).toBe(true);
    expect(start().lootTaken).toEqual([false, false]);
  });
});

describe('loot laid out on the maps', () => {
  for (const map of MAP_LIST) {
    const loot = map.loot ?? [];

    it(`${map.name}: has loot with unique ids`, () => {
      expect(loot.length).toBeGreaterThan(0);
      expect(new Set(loot.map((spawn) => spawn.id)).size).toBe(loot.length);
    });

    it(`${map.name}: every item rests on a surface with nothing on top of it`, () => {
      for (const spawn of loot) {
        const { x, y, z } = spawn.position;
        const restsOn = map.solids.some(
          (solid) =>
            Math.abs(solid.max.y - y) < 1e-6 &&
            x > solid.min.x &&
            x < solid.max.x &&
            z > solid.min.z &&
            z < solid.max.z,
        );
        expect(restsOn, `${spawn.id} rests on a surface`).toBe(true);
        // A 30 cm cube of clear air above the surface: nothing is stacked on the item.
        const buried = collidesAt({ x, y: y + 0.02, z }, 0.15, 0.3, map.solids);
        expect(buried, `${spawn.id} is clear`).toBe(false);
      }
    });

    it(`${map.name}: every item can be reached on foot from the spawn`, () => {
      const grid = getNavGrid(map);
      const reachable = computeReachableMask(grid, map.spawn.position);
      for (const spawn of loot) {
        let inReach = false;
        for (let row = 0; row < grid.rows && !inReach; row++) {
          for (let col = 0; col < grid.cols && !inReach; col++) {
            if (!reachable[row * grid.cols + col]) continue;
            const cell = cellCenter(grid, col, row);
            inReach = nearestLoot([spawn], [false], { x: cell.x, y: 0, z: cell.z }) === 0;
          }
        }
        expect(inReach, `${spawn.id} is within reach of walkable ground`).toBe(true);
      }
    });
  }
});
