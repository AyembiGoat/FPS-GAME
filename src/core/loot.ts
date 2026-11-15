/**
 * Items lying in the world that the player picks up: healing and boost items, vests and helmets.
 *
 * Pure data and functions. A map lists where its loot lies; the game state only remembers which
 * of those have been taken. Every number here is game balance.
 */
import type { ConsumableId, ConsumableInventory } from './consumables';
import { CONSUMABLE_CARRY_LIMIT, CONSUMABLES } from './consumables';
import type { ArmourPiece, ArmourState } from './damage';
import { ARMOUR_TUNING, armourMaxDurability } from './damage';
import type { Vec3 } from './vec';

export type LootItem =
  | { readonly kind: 'consumable'; readonly id: ConsumableId; readonly count: number }
  | { readonly kind: 'armour'; readonly piece: ArmourPiece; readonly level: 1 | 2 | 3 };

export interface LootSpawn {
  readonly id: string;
  readonly item: LootItem;
  /** Where the item rests: on the floor, or on top of the solid it lies on. */
  readonly position: Vec3;
}

export const LOOT_TUNING = {
  /** Horizontal distance in metres from the player's feet within which an item can be taken. */
  reach: 2,
  /** Items resting higher above the player's feet than this are out of reach. */
  reachAbove: 2,
  /** Items resting further below the player's feet than this are out of reach. */
  reachBelow: 1.2,
} as const;

export type LootRefusal = 'carry-limit' | 'wearing-better';

export function lootName(item: LootItem): string {
  if (item.kind === 'consumable') return CONSUMABLES[item.id].name;
  return `${item.piece === 'vest' ? 'Vest' : 'Helmet'} (Level ${item.level})`;
}

/**
 * Why the player cannot take this item, or `null` when they can.
 * Armour is only swapped for a higher level, or for an undamaged piece of the same level.
 */
export function lootRefusal(
  item: LootItem,
  inventory: ConsumableInventory,
  armour: ArmourState,
): LootRefusal | null {
  if (item.kind === 'consumable') {
    return inventory[item.id] >= CONSUMABLE_CARRY_LIMIT ? 'carry-limit' : null;
  }
  const wornLevel = item.piece === 'vest' ? armour.vest : armour.helmet;
  const wornDurability = item.piece === 'vest' ? armour.vestDurability : armour.helmetDurability;
  if (item.level > wornLevel) return null;
  if (item.level === wornLevel && wornDurability < armourMaxDurability(item.piece, item.level)) {
    return null;
  }
  return 'wearing-better';
}

/**
 * Add an item to what the player carries or wears. The caller checks `lootRefusal` first.
 * A piece of armour replaces the one worn; the old piece is discarded, not dropped.
 */
export function applyLoot(
  item: LootItem,
  inventory: ConsumableInventory,
  armour: ArmourState,
): { inventory: ConsumableInventory; armour: ArmourState } {
  if (item.kind === 'consumable') {
    const carried = Math.min(CONSUMABLE_CARRY_LIMIT, inventory[item.id] + Math.max(0, item.count));
    return { inventory: { ...inventory, [item.id]: carried }, armour };
  }
  return {
    inventory,
    armour:
      item.piece === 'vest'
        ? {
            ...armour,
            vest: item.level,
            vestDurability: ARMOUR_TUNING.vestDurability[item.level],
          }
        : {
            ...armour,
            helmet: item.level,
            helmetDurability: ARMOUR_TUNING.helmetDurability[item.level],
          },
  };
}

/** Index of the closest item still lying within reach of the player's feet, or `null`. */
export function nearestLoot(
  spawns: readonly LootSpawn[],
  taken: readonly boolean[],
  feet: Vec3,
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index < spawns.length; index++) {
    const spawn = spawns[index];
    if (!spawn || taken[index]) continue;
    const rise = spawn.position.y - feet.y;
    if (rise > LOOT_TUNING.reachAbove || rise < -LOOT_TUNING.reachBelow) continue;
    const distance = Math.hypot(spawn.position.x - feet.x, spawn.position.z - feet.z);
    if (distance > LOOT_TUNING.reach || distance >= bestDistance) continue;
    best = index;
    bestDistance = distance;
  }
  return best;
}
