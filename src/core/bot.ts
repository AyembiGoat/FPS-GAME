/**
 * A scripted player. It walks the map, finds what the current mode asks it to shoot, and
 * does it with the same inputs a person has: leaning round cover, aiming down the sights,
 * sprinting between engagements, switching to its sidearm when dry, and taking cover from
 * hostile fire by breaking line of sight.
 *
 * It exists so that tests and agents can play the game: if the bot can finish a mode, the
 * movement, collision, weapons, hostiles and level layout all work together. Whatever a
 * player can do, the bot must be able to do.
 */

import type { Box } from './collision';
import { raycast } from './collision';
import type { EnemyState } from './enemy';
import { isEnemyAlive } from './enemy';
import type { GameInput, GameState } from './game';
import { activeWeaponSpec, targetCentre, targetHitBoxes } from './game';
import type { GameMap } from './map';
import type { NavGrid } from './nav';
import { cellIndexAt, cellCentre, distanceField, findPath, navGrid, nearestOpenCell } from './nav';
import { eyeAt, eyePosition, leanRoom, NO_INPUT } from './player';
import type { Vec3 } from './vec';
import { angleDelta, clamp, length, sub } from './vec';
import type { WeaponSlot } from './weapon';
import { getWeaponSpec } from './weapon';

/** Leans shallower than this are not worth taking. */
const MIN_USEFUL_LEAN = 0.15;
/** Radians per step the bot may turn. Roughly a quick human flick. */
const MAX_TURN = 0.14;
const AIM_TOLERANCE = 0.004;
/** Steps a cached route is trusted before it is replanned (about 1.5 s). */
const PATH_LIFETIME_STEPS = 90;

function turnToward(current: number, wanted: number): number {
  return clamp(angleDelta(current, wanted), -MAX_TURN, MAX_TURN);
}

export type Bot = (state: GameState) => GameInput;

export function createBot(map: GameMap): Bot {
  const grid: NavGrid = navGrid(map);
  // One field per steel plate, leading to the open cell just in front of its plate.
  const fields = map.targets.map((target) =>
    distanceField(
      grid,
      nearestOpenCell(
        grid,
        map,
        target.position.x + target.facing.x * 1.2,
        target.position.z + target.facing.z * 1.2,
      ),
    ),
  );

  // Route to a hostile. Recomputed when the hostile moves far enough or the route ages.
  let huntPath: Vec3[] = [];
  let huntIndex = 0;
  let huntCell = -1;
  let huntSteps = 0;

  function canSeeTargetFrom(state: GameState, index: number, range: number, eye: Vec3): boolean {
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
    // The plate is visible if nothing else is hit before reaching it.
    return raycast(eye, direction, distance - 0.05, [...map.solids, ...others]) === null;
  }

  /**
   * Which way to lean to see a target from where the bot stands: 0 if it is visible
   * standing straight, -1 or 1 if only a lean reveals it, null if it cannot be seen.
   */
  function leanToSee(state: GameState, index: number, range: number): -1 | 0 | 1 | null {
    const target = map.targets[index];
    if (!target) return null;
    const feet = state.player.position;
    // Judge the lean as it will be once the bot has turned to face the target.
    const yaw = Math.atan2(feet.x - target.position.x, feet.z - target.position.z);
    if (canSeeTargetFrom(state, index, range, eyeAt(feet, yaw, 0))) return 0;
    for (const side of [-1, 1] as const) {
      const room = leanRoom(feet, yaw, side, map.solids);
      if (room < MIN_USEFUL_LEAN) continue;
      if (canSeeTargetFrom(state, index, range, eyeAt(feet, yaw, side * room))) return side;
    }
    return null;
  }

  /** Line of sight to a plate from where the eye is standing right now. */
  function canSeeTarget(state: GameState, index: number, range: number): boolean {
    return canSeeTargetFrom(state, index, range, eyePosition(state.player));
  }

  function enemyChest(enemy: EnemyState): Vec3 {
    return { x: enemy.position.x, y: enemy.position.y + 1.22, z: enemy.position.z };
  }

  /** Clear line from the bot's eye to a hostile's chest. */
  function canSeeEnemy(state: GameState, enemy: EnemyState): boolean {
    const eye = eyePosition(state.player);
    const to = sub(enemyChest(enemy), eye);
    const distance = length(to);
    if (distance > activeWeaponSpec(state).range) return false;
    const direction = { x: to.x / distance, y: to.y / distance, z: to.z / distance };
    return raycast(eye, direction, distance - 0.05, map.solids) === null;
  }

  function nearestAlive(state: GameState): EnemyState | null {
    const eye = eyePosition(state.player);
    let best: EnemyState | null = null;
    let bestDistance = Infinity;
    for (const enemy of state.enemies) {
      if (!isEnemyAlive(enemy)) continue;
      const d = Math.hypot(enemy.position.x - eye.x, enemy.position.z - eye.z);
      if (d < bestDistance) {
        bestDistance = d;
        best = enemy;
      }
    }
    return best;
  }

  /** Walk toward a hostile until it is in sight, then hold still and shoot it. */
  function fight(state: GameState, target: EnemyState): GameInput {
    const player = state.player;
    const weapon = state.weapon;
    const spec = activeWeaponSpec(state);
    const chest = enemyChest(target);
    const eye = eyePosition(player);
    const to = sub(chest, eye);
    const distance = Math.hypot(to.x, to.z);
    const wantedYaw = Math.atan2(-to.x, -to.z);
    const wantedPitch = Math.atan2(to.y, distance);
    const yawError = angleDelta(player.yaw, wantedYaw);
    const pitchError = wantedPitch - (player.pitch + weapon.recoil);
    const onTarget = Math.abs(yawError) < AIM_TOLERANCE && Math.abs(pitchError) < AIM_TOLERANCE;
    const visible = canSeeEnemy(state, target);
    const inRange = distance <= spec.range;
    const canTrigger = spec.fireMode === 'auto' ? true : !weapon.triggerHeld;
    const ready =
      weapon.switchRemaining === 0 &&
      weapon.reloadRemaining === 0 &&
      weapon.aim >= 1 &&
      canTrigger &&
      weapon.cooldown === 0;

    // Close the distance only while the target is too far to engage or hidden.
    const needsToMove = !visible || !inRange || distance > 26;
    const yawDelta = clamp(yawError, -MAX_TURN, MAX_TURN);
    const turnDone = Math.abs(angleDelta(player.yaw + yawDelta, wantedYaw)) < 0.06;
    const reload =
      weapon.reloadRemaining === 0 && weapon.rounds < Math.min(6, spec.magazineSize / 2);

    return {
      ...NO_INPUT,
      yawDelta,
      pitchDelta: clamp(pitchError, -MAX_TURN, MAX_TURN),
      aim: weapon.switchRemaining === 0 && weapon.reloadRemaining === 0,
      forward: needsToMove && turnDone ? 1 : 0,
      sprint: needsToMove && turnDone && !visible && distance > 8,
      fire: onTarget && ready && visible && inRange,
      reload,
    };
  }

  /** Follow a cached route to the target hostile's current position. */
  function approach(state: GameState, target: EnemyState): GameInput {
    const player = state.player;
    const spec = activeWeaponSpec(state);
    const targetCell = cellIndexAt(grid, map, target.position.x, target.position.z);
    huntSteps += 1;
    const stale =
      huntSteps > PATH_LIFETIME_STEPS || huntCell !== targetCell || huntPath.length === 0;
    if (stale) {
      huntPath = findPath(grid, map, player.position, {
        x: target.position.x,
        y: 0,
        z: target.position.z,
      });
      huntIndex = 0;
      huntCell = targetCell;
      huntSteps = 0;
    }

    let waypoint = huntPath[huntIndex];
    while (waypoint) {
      const d = Math.hypot(waypoint.x - player.position.x, waypoint.z - player.position.z);
      if (d > 0.5) break;
      huntIndex += 1;
      waypoint = huntPath[huntIndex];
    }
    if (!waypoint) {
      return { ...NO_INPUT, aim: false, fire: false, reload: state.weapon.rounds === 0 };
    }

    const dx = waypoint.x - player.position.x;
    const dz = waypoint.z - player.position.z;
    const wantedYaw = Math.atan2(-dx, -dz);
    const yawDelta = turnToward(player.yaw, wantedYaw);
    const facing = Math.abs(angleDelta(player.yaw + yawDelta, wantedYaw)) < 0.3;
    const shouldReload =
      state.weapon.reloadRemaining === 0 && state.weapon.rounds < Math.ceil(spec.magazineSize / 2);

    if (state.weapon.rounds === 0 && state.weapon.reloadRemaining === 0) {
      return { ...NO_INPUT, aim: false, fire: false, reload: true };
    }

    return {
      ...NO_INPUT,
      yawDelta,
      pitchDelta: clamp(-player.pitch, -MAX_TURN, MAX_TURN),
      forward: facing ? 1 : 0,
      sprint: facing && !shouldReload,
      reload: shouldReload,
      fire: false,
    };
  }

  function fightMode(state: GameState): GameInput {
    const { weapon } = state;
    const spec = activeWeaponSpec(state);
    const otherSlot: WeaponSlot = weapon.activeSlot === 'primary' ? 'secondary' : 'primary';
    const otherSpec = getWeaponSpec(weapon.loadout[otherSlot]);

    // Empty magazine and a hostile close by: draw the sidearm if that is quicker.
    if (weapon.rounds === 0 && weapon.reloadRemaining === 0 && weapon.switchRemaining === 0) {
      const target = nearestAlive(state);
      if (target && otherSpec.equipTime < spec.reloadTime && weapon.slotRounds[otherSlot] > 0) {
        return { ...NO_INPUT, fire: false, reload: false, switchSlot: otherSlot };
      }
      return { ...NO_INPUT, fire: false, reload: true };
    }

    // Fight whoever is in sight; otherwise work toward the closest hostile.
    let visible: EnemyState | null = null;
    let visibleDistance = Infinity;
    for (const enemy of state.enemies) {
      if (!isEnemyAlive(enemy)) continue;
      if (!canSeeEnemy(state, enemy)) continue;
      const d = Math.hypot(
        enemy.position.x - state.player.position.x,
        enemy.position.z - state.player.position.z,
      );
      if (d < visibleDistance) {
        visibleDistance = d;
        visible = enemy;
      }
    }
    if (visible) {
      huntPath = [];
      return fight(state, visible);
    }

    const target = nearestAlive(state);
    if (!target) return { ...NO_INPUT, fire: false, reload: false };
    return approach(state, target);
  }

  function steelMode(state: GameState): GameInput {
    const { player, weapon } = state;
    const spec = activeWeaponSpec(state);
    const otherSlot: WeaponSlot = weapon.activeSlot === 'primary' ? 'secondary' : 'primary';
    const otherSpec = getWeaponSpec(weapon.loadout[otherSlot]);
    const rawHere = cellIndexAt(grid, map, player.position.x, player.position.z);
    const here = grid.open[rawHere]
      ? rawHere
      : nearestOpenCell(grid, map, player.position.x, player.position.z);

    // Prefer a target that can be engaged from here, standing or leaning. Otherwise
    // head for the closest one by walking distance.
    let engage = -1;
    let lean: -1 | 0 | 1 = 0;
    let nearest = -1;
    let nearestDistance = Infinity;
    map.targets.forEach((_, index) => {
      if (state.targetsDown[index]) return;
      if (engage < 0) {
        const side = leanToSee(state, index, spec.range);
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

    // If out of ammo with a live target in sight and our backup firearm is loaded and
    // quicker to draw than a full reload, switch slots immediately.
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
      // Aim from where the eye really is right now, mid-lean included.
      const eye = eyePosition(player);
      const to = sub(targetCentre(engaged), eye);
      const wantedYaw = Math.atan2(-to.x, -to.z);
      const wantedPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
      const yawError = angleDelta(player.yaw, wantedYaw);
      // Recoil lifts the real aim, so correct against where the muzzle actually points.
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
        fire: onTarget && ready && canSeeTarget(state, engage, spec.range),
        reload: false,
      };
    }

    const field = fields[nearest];
    if (!field) return { ...NO_INPUT, fire: false, reload: weapon.rounds < spec.magazineSize };

    // Step to whichever neighbouring cell is closer to the goal.
    let next = here;
    let nextDistance = field[here] ?? Infinity;
    const i = here % grid.width;
    const j = Math.floor(here / grid.width);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
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

    const waypoint = cellCentre(grid, next);
    const yawDelta = turnToward(
      player.yaw,
      Math.atan2(-(waypoint.x - player.position.x), -(waypoint.z - player.position.z)),
    );
    const facing =
      Math.abs(
        angleDelta(
          player.yaw + yawDelta,
          Math.atan2(-(waypoint.x - player.position.x), -(waypoint.z - player.position.z)),
        ),
      ) < 0.3;

    // Top up between targets rather than running dry in front of the next one.
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
  }

  return (state) => (state.mode === 'firefight' ? fightMode(state) : steelMode(state));
}
