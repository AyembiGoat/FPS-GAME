/**
 * A scripted player. It walks the map, finds standing targets and shoots them using
 * the same inputs a person has, including leaning round cover, aiming down the
 * sights, sprinting between engagements, and switching to its sidearm when dry.
 * It exists so that tests and agents can play the game: if the bot can clear the
 * map, movement, collision, the weapons and the level layout all work together.
 *
 * Whatever a player can do, the bot must be able to do. A new ability gets a new
 * input in GameInput, and the bot is taught when to use it in the same change.
 */

import type { Box } from './collision';
import { bodyBox, overlaps, raycast } from './collision';
import type { GameInput, GameState } from './game';
import { activeWeaponSpec, targetCentre, targetHitBoxes } from './game';
import type { GameMap } from './map';
import { eyeAt, eyePosition, leanRoom, NO_INPUT, PLAYER_TUNING } from './player';
import type { Vec3 } from './vec';
import { angleDelta, clamp, length, sub } from './vec';
import type { WeaponSlot } from './weapon';
import { getWeaponSpec } from './weapon';

const CELL = 0.4;
/** Leans shallower than this are not worth taking. */
const MIN_USEFUL_LEAN = 0.15;
/** Radians per step the bot may turn. Roughly a quick human flick. */
const MAX_TURN = 0.14;
const AIM_TOLERANCE = 0.004;
const CLEARANCE = 0.08;

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
      // Lifted off the floor so the floor slab itself does not count as blocking.
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

/** Walking distance, in cells, from every open cell to `goal`. */
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

export type Bot = (state: GameState) => GameInput;

export function createBot(map: GameMap): Bot {
  const grid = buildGrid(map);
  // One field per target, leading to the open cell just in front of its plate.
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

  function canSee(eye: Vec3, index: number, state: GameState, range: number): boolean {
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
    if (canSee(eyeAt(feet, yaw, 0), index, state, range)) return 0;
    for (const side of [-1, 1] as const) {
      const room = leanRoom(feet, yaw, side, map.solids);
      if (room < MIN_USEFUL_LEAN) continue;
      if (canSee(eyeAt(feet, yaw, side * room), index, state, range)) return side;
    }
    return null;
  }

  return (state) => {
    const { player, weapon } = state;
    const spec = activeWeaponSpec(state);
    const otherSlot: WeaponSlot = weapon.activeSlot === 'primary' ? 'secondary' : 'primary';
    const otherSpec = getWeaponSpec(weapon.loadout[otherSlot]);
    const rawHere = cellAt(map, grid, player.position.x, player.position.z);
    const here = grid.open[rawHere]
      ? rawHere
      : nearestOpenCell(map, grid, player.position.x, player.position.z);

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
        fire: onTarget && ready && canSee(eye, engage, state, spec.range),
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
  };
}
