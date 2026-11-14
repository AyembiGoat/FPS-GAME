/**
 * Walking space worked out from a map's own collision boxes.
 *
 * Every consumer (the scripted player, enemy AI) uses this one grid, so anything that can
 * walk the map finds the same corridors. It is a pure function of the map, which is why
 * the grid is cached per map: rebuilding it every step would cost more than the game.
 */

import type { Box } from './collision';
import { bodyBox, overlaps } from './collision';
import type { GameMap } from './map';
import type { Vec3 } from './vec';
import { clamp } from './vec';

/** Centre-to-centre spacing of the walking grid. Smaller than the player's radius. */
export const NAV_CELL = 0.45;
/** Extra space an agent needs either side of it to call a cell walkable. */
const CLEARANCE = 0.04;

export interface NavGrid {
  readonly width: number;
  readonly depth: number;
  readonly open: readonly boolean[];
  /** World centre of every cell, flattened the same way as `open`. */
  readonly centreX: readonly number[];
  readonly centreZ: readonly number[];
}

function buildGrid(map: GameMap): NavGrid {
  const width = Math.floor((map.bounds.maxX - map.bounds.minX) / NAV_CELL);
  const depth = Math.floor((map.bounds.maxZ - map.bounds.minZ) / NAV_CELL);
  const open: boolean[] = [];
  const centreX: number[] = [];
  const centreZ: number[] = [];
  const walls = map.solids.filter((solid) => solid.max.y > 0.25);
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const x = map.bounds.minX + (i + 0.5) * NAV_CELL;
      const z = map.bounds.minZ + (j + 0.5) * NAV_CELL;
      // Lifted off the floor so the floor slab itself does not count as blocking.
      const body = bodyBox({ x, y: 0.05, z }, 0.3 + CLEARANCE, 1.8);
      open.push(!walls.some((solid) => overlaps(body, solid)));
      centreX.push(x);
      centreZ.push(z);
    }
  }
  return { width, depth, open, centreX, centreZ };
}

const CACHE = new WeakMap<GameMap, NavGrid>();

/** The walking grid for a map. Built on first use and shared afterwards. */
export function navGrid(map: GameMap): NavGrid {
  let grid = CACHE.get(map);
  if (!grid) {
    grid = buildGrid(map);
    CACHE.set(map, grid);
  }
  return grid;
}

export function cellIndexAt(grid: NavGrid, map: GameMap, x: number, z: number): number {
  const i = clamp(Math.floor((x - map.bounds.minX) / NAV_CELL), 0, grid.width - 1);
  const j = clamp(Math.floor((z - map.bounds.minZ) / NAV_CELL), 0, grid.depth - 1);
  return j * grid.width + i;
}

export function cellCentre(grid: NavGrid, cell: number): Vec3 {
  return { x: grid.centreX[cell] ?? 0, y: 0, z: grid.centreZ[cell] ?? 0 };
}

/** The walkable cell nearest a point, so an agent never starts pathing from inside a wall. */
export function nearestOpenCell(grid: NavGrid, map: GameMap, x: number, z: number): number {
  const start = cellIndexAt(grid, map, x, z);
  if (grid.open[start]) return start;
  let best = start;
  let bestDistance = Infinity;
  for (let cell = 0; cell < grid.open.length; cell++) {
    if (!grid.open[cell]) continue;
    const d = Math.hypot((grid.centreX[cell] ?? 0) - x, (grid.centreZ[cell] ?? 0) - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = cell;
    }
  }
  return best;
}

export const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Walking distance, in cells, from every open cell to `goal`. Unreachable cells stay Infinity. */
export function distanceField(grid: NavGrid, goal: number): number[] {
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

/**
 * Waypoints from `from` to `goal`, both world points. Runs of cells in one direction are
 * merged so an agent walks a straight corridor instead of stepping cell by cell.
 * Returns an empty array when the goal cannot be reached.
 */
export function findPath(grid: NavGrid, map: GameMap, from: Vec3, goal: Vec3): Vec3[] {
  const start = nearestOpenCell(grid, map, from.x, from.z);
  const end = nearestOpenCell(grid, map, goal.x, goal.z);
  if (start === end) return [{ x: goal.x, y: 0, z: goal.z }];

  const field = distanceField(grid, end);
  if (!Number.isFinite(field[start] ?? Infinity)) return [];

  const cells: number[] = [];
  let cell = start;
  for (let guard = 0; guard < grid.open.length; guard++) {
    cells.push(cell);
    if (cell === end) break;
    const i = cell % grid.width;
    const j = Math.floor(cell / grid.width);
    let next = cell;
    let best = field[cell] ?? Infinity;
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.depth) continue;
      const candidate = nj * grid.width + ni;
      const d = field[candidate] ?? Infinity;
      if (d < best) {
        best = d;
        next = candidate;
      }
    }
    if (next === cell) return [];
    cell = next;
  }

  // Merge straight runs: keep a waypoint only where the walking direction changes.
  const points: Vec3[] = [];
  for (let k = 0; k < cells.length; k++) {
    const current = cells[k] ?? 0;
    const previous = cells[k - 1];
    const nextCell = cells[k + 1];
    if (previous !== undefined && nextCell !== undefined) {
      const px = (current % grid.width) - (previous % grid.width);
      const pz = Math.floor(current / grid.width) - Math.floor(previous / grid.width);
      const nx = (nextCell % grid.width) - (current % grid.width);
      const nz = Math.floor(nextCell / grid.width) - Math.floor(current / grid.width);
      if (px === nx && pz === nz) continue;
    }
    points.push(cellCentre(grid, current));
  }
  // The last step goes to the requested point, not the centre of its cell.
  const last = points[points.length - 1];
  if (last) points[points.length - 1] = { x: goal.x, y: 0, z: goal.z };
  return points;
}

/** True when a body of `radius` can stand at `feet` without touching a solid. */
export function isClearAt(feet: Vec3, radius: number, solids: readonly Box[]): boolean {
  const body = bodyBox({ x: feet.x, y: 0.05, z: feet.z }, radius, 1.8);
  return !solids.some((solid) => overlaps(body, solid));
}
