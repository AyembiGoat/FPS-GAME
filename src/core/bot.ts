/**
 * Deterministic scripted player bot for automated playtesting and core verification.
 *
 * Uses the exact same `GameInput` contract a human player has (WASD, sprint, lean, ADS,
 * fire, reload, slot switch) and handles both:
 *  - Combat modes (`combat`, `veteran`): navigates the compound via `findPath`, leans corners,
 *    prioritizes head/upper-torso shots on live enemy combatants, strafes while engaging, and
 *    reloads/swaps weapons safely.
 *  - Target Range mode (`range`): clears all standing AR500 steel silhouettes across the map.
 */

import type { Box } from './collision';
import { bodyBox, overlaps, raycast } from './collision';
import { CONSUMABLES, consumableAtCap, resolveConsumableRequest } from './consumables';
import type { EnemyState } from './enemy';
import type { GameInput, GameState } from './game';
import { activeWeaponSpec, targetCentre, targetHitBoxes } from './game';
import type { GameMap } from './map';
import { getGameModeSpec } from './modes';
import { eyeAt, eyePosition, leanRoom, NO_INPUT, PLAYER_TUNING } from './player';
import type { Vec3 } from './vec';
import { angleDelta, clamp, length, sub, vec3 } from './vec';
import type { WeaponSlot } from './weapon';
import { getWeaponSpec } from './weapon';

const CELL = 0.4;
const MIN_USEFUL_LEAN = 0.15;
const MAX_TURN = 0.18;
const AIM_TOLERANCE = 0.008;
const CLEARANCE = 0.08;
/** Health at or below which the bot stops to heal once no enemy is in sight. */
const BOT_HEAL_BELOW = 55;

interface Grid {
  readonly width: number;
  readonly depth: number;
  readonly open: readonly boolean[];
}

function buildGrid(map: GameMap): Grid {
  const width = Math.floor((map.bounds.maxX - map.bounds.minX) / CELL);
  const depth = Math.floor((map.bounds.maxZ - map.bounds.minZ) / CELL);
  const open: boolean[] = [];
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const centre = cellCentre(map, i, j);
      const body = bodyBox(
        { x: centre.x, y: 0.05, z: centre.z },
        PLAYER_TUNING.radius + CLEARANCE,
        PLAYER_TUNING.height,
      );
      open.push(!map.solids.some((solid) => overlaps(body, solid)));
    }
  }
  return { width, depth, open };
}

function cellCentre(map: GameMap, i: number, j: number): { x: number; z: number } {
  return { x: map.bounds.minX + (i + 0.5) * CELL, z: map.bounds.minZ + (j + 0.5) * CELL };
}

function cellAt(map: GameMap, grid: Grid, x: number, z: number): number {
  const i = clamp(Math.floor((x - map.bounds.minX) / CELL), 0, grid.width - 1);
  const j = clamp(Math.floor((z - map.bounds.minZ) / CELL), 0, grid.depth - 1);
  return j * grid.width + i;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function distanceField(grid: Grid, goal: number): number[] {
  const distance = new Array<number>(grid.open.length).fill(Infinity);
  const queue = [goal];
  distance[goal] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] ?? 0;
    const i = cell % grid.width;
    const j = Math.floor(cell / grid.width);
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.depth) continue;
      const next = nj * grid.width + ni;
      if (!grid.open[next] || distance[next] !== Infinity) continue;
      distance[next] = (distance[cell] ?? 0) + 1;
      queue.push(next);
    }
  }
  return distance;
}

function nearestOpenCell(map: GameMap, grid: Grid, x: number, z: number): number {
  let best = 0;
  let bestDistance = Infinity;
  grid.open.forEach((open, cell) => {
    if (!open) return;
    const centre = cellCentre(map, cell % grid.width, Math.floor(cell / grid.width));
    const d = Math.hypot(centre.x - x, centre.z - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = cell;
    }
  });
  return best;
}

function turnToward(current: number, wanted: number): number {
  return clamp(angleDelta(current, wanted), -MAX_TURN, MAX_TURN);
}

function enemyAimPoint(enemy: EnemyState, preferTorso: boolean): Vec3 {
  if (preferTorso) {
    const y = enemy.crouched ? 0.88 : 1.24;
    return vec3(enemy.position.x, enemy.position.y + y, enemy.position.z);
  }
  // Head center (`1.10..1.38` crouched, `1.48..1.78` standing).
  const y = enemy.crouched ? 1.24 : 1.63;
  return vec3(enemy.position.x, enemy.position.y + y, enemy.position.z);
}

export type Bot = (state: GameState) => GameInput;

export function createBot(map: GameMap): Bot {
  const grid = buildGrid(map);
  const fields = map.targets.map((target) =>
    distanceField(
      grid,
      nearestOpenCell(
        map,
        grid,
        target.position.x + target.facing.x * 1.2,
        target.position.z + target.facing.z * 1.2,
      ),
    ),
  );

  // Cached navigation state for enemy combat pursuit.
  let cachedGoalCell = -1;
  let cachedField: number[] | null = null;
  let cachedTick = 0;

  function canSeePoint(eye: Vec3, point: Vec3, range: number): boolean {
    const toPoint = sub(point, eye);
    const distance = length(toPoint);
    if (distance > range || distance < 0.05) return false;
    const direction = {
      x: toPoint.x / distance,
      y: toPoint.y / distance,
      z: toPoint.z / distance,
    };
    return raycast(eye, direction, distance - 0.08, map.solids) === null;
  }

  function canSeeTarget(eye: Vec3, index: number, state: GameState, range: number): boolean {
    const target = map.targets[index];
    if (!target) return false;
    const toTarget = sub(targetCentre(target), eye);
    const distance = length(toTarget);
    if (distance > range) return false;
    const direction = {
      x: toTarget.x / distance,
      y: toTarget.y / distance,
      z: toTarget.z / distance,
    };
    const others: Box[] = map.targets.flatMap((spawn, other) =>
      other === index || state.targetsDown[other] ? [] : targetHitBoxes(spawn),
    );
    return raycast(eye, direction, distance - 0.05, [...map.solids, ...others]) === null;
  }

  function leanToSeeTarget(state: GameState, index: number, range: number): -1 | 0 | 1 | null {
    const target = map.targets[index];
    if (!target) return null;
    const feet = state.player.position;
    const yaw = Math.atan2(feet.x - target.position.x, feet.z - target.position.z);
    if (canSeeTarget(eyeAt(feet, yaw, 0), index, state, range)) return 0;
    for (const side of [-1, 1] as const) {
      const room = leanRoom(feet, yaw, side, map.solids);
      if (room < MIN_USEFUL_LEAN) continue;
      if (canSeeTarget(eyeAt(feet, yaw, side * room), index, state, range)) return side;
    }
    return null;
  }

  function leanToSeeEnemy(
    state: GameState,
    enemy: EnemyState,
    preferTorso: boolean,
    range: number,
  ): { readonly side: -1 | 0 | 1; readonly aimPt: Vec3 } | null {
    const feet = state.player.position;
    const yaw = Math.atan2(feet.x - enemy.position.x, feet.z - enemy.position.z);
    const primaryPt = enemyAimPoint(enemy, preferTorso);
    const fallbackPt = enemyAimPoint(enemy, !preferTorso);

    for (const pt of [primaryPt, fallbackPt]) {
      if (canSeePoint(eyeAt(feet, yaw, 0), pt, range)) {
        return { side: 0, aimPt: pt };
      }
    }
    for (const side of [-1, 1] as const) {
      const room = leanRoom(feet, yaw, side, map.solids);
      if (room < MIN_USEFUL_LEAN) continue;
      const leanedEye = eyeAt(feet, yaw, side * room);
      for (const pt of [primaryPt, fallbackPt]) {
        if (canSeePoint(leanedEye, pt, range)) {
          return { side, aimPt: pt };
        }
      }
    }
    return null;
  }

  const idleInput: GameInput = { ...NO_INPUT, fire: false, reload: false, aim: false };

  function stepEnemyCombatBot(state: GameState): GameInput {
    cachedTick++;
    if (state.outcome !== 'ongoing') {
      return idleInput;
    }

    const { player, weapon } = state;
    const modeSpec = getGameModeSpec(state.mode);
    const spec = activeWeaponSpec(state);
    const otherSlot: WeaponSlot = weapon.activeSlot === 'primary' ? 'secondary' : 'primary';
    const otherSpec = getWeaponSpec(weapon.loadout[otherSlot]);
    const isBuckshot = spec.pellets > 1;
    const effectiveEngageRange = isBuckshot
      ? Math.min(spec.range, 20)
      : spec.category === 'pistol'
        ? Math.min(spec.range, 34)
        : spec.range;

    // Find best visible live enemy (prioritize enemies that can see us or are closest) and closest overall.
    let bestVisible: {
      enemy: EnemyState;
      side: -1 | 0 | 1;
      aimPt: Vec3;
      score: number;
    } | null = null;
    let closestEnemy: EnemyState | null = null;
    let closestDist = Infinity;

    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const d = Math.hypot(
        enemy.position.x - player.position.x,
        enemy.position.z - player.position.z,
      );
      if (d < closestDist) {
        closestDist = d;
        closestEnemy = enemy;
      }

      const peek = leanToSeeEnemy(state, enemy, isBuckshot, effectiveEngageRange);
      if (peek) {
        const threatBonus = enemy.canSeePlayer ? -18 : 0;
        const score = d + threatBonus + (peek.side !== 0 ? 1.5 : 0);
        if (!bestVisible || score < bestVisible.score) {
          bestVisible = { enemy, side: peek.side, aimPt: peek.aimPt, score };
        }
      }
    }

    // Patch up between fights: with nobody in sight, start a heal when hurt and hold still for it.
    if (!bestVisible) {
      if (state.consumableUse) return idleInput;
      if (state.playerHealth <= BOT_HEAL_BELOW) {
        const heal = resolveConsumableRequest(
          'best-heal',
          state.consumables,
          state.playerHealth,
          state.playerBoost,
        );
        if (heal && !consumableAtCap(CONSUMABLES[heal], state.playerHealth, state.playerBoost)) {
          return { ...idleInput, useConsumable: heal };
        }
      }
    }

    // Prefer primary weapon whenever safe (unless playing Gun Game where weapon tier is locked).
    if (
      !modeSpec.usesWeaponLadder &&
      !bestVisible &&
      weapon.activeSlot === 'secondary' &&
      weapon.switchRemaining === 0 &&
      weapon.reloadRemaining === 0
    ) {
      return { ...idleInput, switchSlot: 'primary' };
    }

    if (weapon.rounds === 0 && weapon.reloadRemaining === 0 && weapon.switchRemaining === 0) {
      if (
        !modeSpec.usesWeaponLadder &&
        bestVisible &&
        weapon.slotRounds[otherSlot] > 0 &&
        otherSpec.equipTime < spec.reloadTime
      ) {
        return { ...idleInput, switchSlot: otherSlot };
      }
      return { ...idleInput, reload: true };
    }

    if (bestVisible) {
      const eye = eyePosition(player);
      const to = sub(bestVisible.aimPt, eye);
      const dist = length(to);
      const wantedYaw = Math.atan2(-to.x, -to.z);
      const wantedPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
      const yawError = angleDelta(player.yaw + weapon.recoilYaw, wantedYaw);
      const pitchError = wantedPitch - (player.pitch + weapon.recoil);
      const tolerance = isBuckshot ? 0.025 : Math.max(AIM_TOLERANCE, 0.11 / Math.max(4, dist));
      const onTarget = Math.abs(yawError) < tolerance && Math.abs(pitchError) < tolerance;
      const canTrigger = spec.fireMode === 'auto' ? true : !weapon.triggerHeld;
      const ready =
        weapon.switchRemaining === 0 &&
        weapon.reloadRemaining === 0 &&
        weapon.aim >= 0.95 &&
        canTrigger &&
        weapon.cooldown === 0;

      // Subtle lateral combat strafe when standing in the open so incoming enemy bursts miss more often.
      const strafe: -1 | 0 | 1 =
        bestVisible.side !== 0 ? 0 : Math.floor(cachedTick / 32) % 2 === 0 ? 1 : -1;

      return {
        ...NO_INPUT,
        right: strafe * 0.65,
        forward: isBuckshot && dist > 11 ? 1 : 0,
        yawDelta: clamp(yawError, -MAX_TURN, MAX_TURN),
        pitchDelta: clamp(pitchError, -MAX_TURN, MAX_TURN),
        lean: bestVisible.side,
        aim: weapon.switchRemaining === 0 && weapon.reloadRemaining === 0,
        fire: onTarget && ready && canSeePoint(eye, bestVisible.aimPt, spec.range),
        reload: false,
      };
    }

    if (!closestEnemy) {
      return idleInput;
    }

    const rawHere = cellAt(map, grid, player.position.x, player.position.z);
    const here = grid.open[rawHere]
      ? rawHere
      : nearestOpenCell(map, grid, player.position.x, player.position.z);
    const goalCell = nearestOpenCell(map, grid, closestEnemy.position.x, closestEnemy.position.z);

    if (goalCell !== cachedGoalCell || !cachedField || cachedTick % 30 === 0) {
      cachedField = distanceField(grid, goalCell);
      cachedGoalCell = goalCell;
    }

    let next = here;
    let nextDistance = cachedField[here] ?? Infinity;
    const i = here % grid.width;
    const j = Math.floor(here / grid.width);
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.depth) continue;
      const cell = nj * grid.width + ni;
      const d = cachedField[cell] ?? Infinity;
      if (d < nextDistance) {
        nextDistance = d;
        next = cell;
      }
    }

    const wp = cellCentre(map, next % grid.width, Math.floor(next / grid.width));
    const dx = wp.x - player.position.x;
    const dz = wp.z - player.position.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    const yawDelta = turnToward(player.yaw, wantedYaw);
    const facing = Math.abs(angleDelta(player.yaw + yawDelta, wantedYaw)) < 0.35;
    const shouldReload =
      weapon.reloadRemaining === 0 && weapon.rounds < Math.ceil(spec.magazineSize * 0.5);

    return {
      ...NO_INPUT,
      yawDelta,
      pitchDelta: clamp(-player.pitch, -MAX_TURN, MAX_TURN),
      forward: facing ? 1 : 0,
      sprint: facing && nextDistance > 8 && !shouldReload && weapon.reloadRemaining === 0,
      reload: shouldReload,
      fire: false,
    };
  }

  return (state) => {
    const modeSpec = getGameModeSpec(state.mode);
    if (modeSpec.usesEnemies) {
      // Takes whatever lies within reach in passing; it never goes out of its way for loot.
      const input = stepEnemyCombatBot(state);
      return state.nearbyLoot !== null && state.nearbyLootRefusal === null
        ? { ...input, interact: true }
        : input;
    }

    // Target Range mode (`range`): steel silhouette clearing loop.
    const { player, weapon } = state;
    const spec = activeWeaponSpec(state);
    const otherSlot: WeaponSlot = weapon.activeSlot === 'primary' ? 'secondary' : 'primary';
    const otherSpec = getWeaponSpec(weapon.loadout[otherSlot]);
    const rawHere = cellAt(map, grid, player.position.x, player.position.z);
    const here = grid.open[rawHere]
      ? rawHere
      : nearestOpenCell(map, grid, player.position.x, player.position.z);

    let engage = -1;
    let lean: -1 | 0 | 1 = 0;
    let nearest = -1;
    let nearestDistance = Infinity;
    map.targets.forEach((_, index) => {
      if (state.targetsDown[index]) return;
      if (engage < 0) {
        const side = leanToSeeTarget(state, index, spec.range);
        if (side !== null) {
          engage = index;
          lean = side;
        }
      }
      const d = fields[index]?.[here] ?? Infinity;
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = index;
      }
    });

    if (weapon.rounds === 0 && weapon.reloadRemaining === 0 && weapon.switchRemaining === 0) {
      if (
        engage >= 0 &&
        weapon.slotRounds[otherSlot] > 0 &&
        otherSpec.equipTime < spec.reloadTime
      ) {
        return { ...NO_INPUT, fire: false, reload: false, switchSlot: otherSlot };
      }
      return { ...NO_INPUT, fire: false, reload: true };
    }

    const engaged = map.targets[engage];
    if (engaged) {
      const eye = eyePosition(player);
      const to = sub(targetCentre(engaged), eye);
      const wantedYaw = Math.atan2(-to.x, -to.z);
      const wantedPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
      const yawError = angleDelta(player.yaw + weapon.recoilYaw, wantedYaw);
      const pitchError = wantedPitch - (player.pitch + weapon.recoil);
      const onTarget = Math.abs(yawError) < AIM_TOLERANCE && Math.abs(pitchError) < AIM_TOLERANCE;
      const canTrigger = spec.fireMode === 'auto' ? true : !weapon.triggerHeld;
      const ready =
        weapon.switchRemaining === 0 &&
        weapon.reloadRemaining === 0 &&
        weapon.aim >= 1 &&
        canTrigger &&
        weapon.cooldown === 0;
      return {
        ...NO_INPUT,
        yawDelta: clamp(yawError, -MAX_TURN, MAX_TURN),
        pitchDelta: clamp(pitchError, -MAX_TURN, MAX_TURN),
        lean,
        aim: weapon.switchRemaining === 0 && weapon.reloadRemaining === 0,
        fire: onTarget && ready && canSeeTarget(eye, engage, state, spec.range),
        reload: false,
      };
    }

    const field = fields[nearest];
    if (!field) return { ...NO_INPUT, fire: false, reload: weapon.rounds < spec.magazineSize };

    let next = here;
    let nextDistance = field[here] ?? Infinity;
    const i = here % grid.width;
    const j = Math.floor(here / grid.width);
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.depth) continue;
      const cell = nj * grid.width + ni;
      const d = field[cell] ?? Infinity;
      if (d < nextDistance) {
        nextDistance = d;
        next = cell;
      }
    }

    const waypoint = cellCentre(map, next % grid.width, Math.floor(next / grid.width));
    const dx = waypoint.x - player.position.x;
    const dz = waypoint.z - player.position.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    const yawDelta = turnToward(player.yaw, wantedYaw);
    const facing = Math.abs(angleDelta(player.yaw + yawDelta, wantedYaw)) < 0.3;
    const shouldReload = weapon.rounds < Math.ceil(spec.magazineSize / 2);

    return {
      ...NO_INPUT,
      yawDelta,
      pitchDelta: clamp(-player.pitch, -MAX_TURN, MAX_TURN),
      forward: facing ? 1 : 0,
      sprint: facing && nextDistance > 6 && !shouldReload && weapon.reloadRemaining === 0,
      reload: shouldReload,
      fire: false,
    };
  };
}
