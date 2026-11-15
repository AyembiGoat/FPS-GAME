import { collidesAt, raycast } from './collision';
import type { GameMap } from './map';
import type { Vec3 } from './vec';
import { vec3 } from './vec';

export interface NavGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly clearanceRadius: number;
  readonly bodyHeight: number;
  /** True when a combatant cylinder/AABB centred on this cell does not overlap any map solid. */
  readonly walkable: readonly boolean[];
  /** Extra traversal cost `[0 .. 1.6]` near walls/corners so agents prefer clean mid-doorway lines. */
  readonly wallPenalty: readonly number[];
}

const navCache = new WeakMap<GameMap, NavGrid>();

export function getNavGrid(map: GameMap): NavGrid {
  const cached = navCache.get(map);
  if (cached) return cached;
  const built = buildNavGrid(map, 1.0, 0.42, 1.78);
  navCache.set(map, built);
  return built;
}

export function buildNavGrid(
  map: GameMap,
  cellSize = 1.0,
  clearanceRadius = 0.42,
  bodyHeight = 1.78,
): NavGrid {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const cols = Math.max(1, Math.floor((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.floor((maxZ - minZ) / cellSize));
  const total = cols * rows;
  const walkable = new Array<boolean>(total).fill(false);
  const wallPenalty = new Array<number>(total).fill(0);

  for (let r = 0; r < rows; r++) {
    const z = minZ + (r + 0.5) * cellSize;
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cellSize;
      const idx = r * cols + c;
      const free = !collidesAt(vec3(x, 0, z), clearanceRadius, bodyHeight, map.solids);
      walkable[idx] = free;
      if (free) {
        // Check slightly wider margin to discourage hugging wall corners when room exists.
        const tight = collidesAt(vec3(x, 0, z), clearanceRadius + 0.32, bodyHeight, map.solids);
        wallPenalty[idx] = tight ? 0.65 : 0;
      }
    }
  }

  return {
    minX,
    minZ,
    cellSize,
    cols,
    rows,
    clearanceRadius,
    bodyHeight,
    walkable,
    wallPenalty,
  };
}

export function cellCenter(grid: NavGrid, col: number, row: number): Vec3 {
  return vec3(grid.minX + (col + 0.5) * grid.cellSize, 0, grid.minZ + (row + 0.5) * grid.cellSize);
}

export function worldToCell(
  grid: NavGrid,
  pos: Vec3,
): { readonly col: number; readonly row: number } {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor((pos.x - grid.minX) / grid.cellSize)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor((pos.z - grid.minZ) / grid.cellSize)));
  return { col, row };
}

/** Find the nearest walkable cell to `pos` within `maxRadiusCells`. */
export function nearestWalkableCell(
  grid: NavGrid,
  pos: Vec3,
  maxRadiusCells = 5,
): { readonly col: number; readonly row: number } | null {
  const start = worldToCell(grid, pos);
  if (grid.walkable[start.row * grid.cols + start.col]) return start;

  for (let rad = 1; rad <= maxRadiusCells; rad++) {
    let best: { col: number; row: number } | null = null;
    let bestDistSq = Infinity;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const col = start.col + dc;
        const row = start.row + dr;
        if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
        if (!grid.walkable[row * grid.cols + col]) continue;
        const center = cellCenter(grid, col, row);
        const dx = center.x - pos.x;
        const dz = center.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          best = { col, row };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** True when an agent can walk in a straight line from `a` to `b` without clipping any solid. */
export function canWalkDirect(
  a: Vec3,
  b: Vec3,
  map: GameMap,
  halfWidth = 0.4,
  height = 1.78,
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  const steps = Math.max(2, Math.ceil(dist / 0.35));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = vec3(a.x + dx * t, 0, a.z + dz * t);
    if (collidesAt(p, halfWidth, height, map.solids)) return false;
  }
  return true;
}

const NEIGHBORS: readonly { readonly dc: number; readonly dr: number; readonly cost: number }[] = [
  { dc: 1, dr: 0, cost: 1 },
  { dc: -1, dr: 0, cost: 1 },
  { dc: 0, dr: 1, cost: 1 },
  { dc: 0, dr: -1, cost: 1 },
  { dc: 1, dr: 1, cost: Math.SQRT2 },
  { dc: 1, dr: -1, cost: Math.SQRT2 },
  { dc: -1, dr: 1, cost: Math.SQRT2 },
  { dc: -1, dr: -1, cost: Math.SQRT2 },
];

/**
 * Deterministic A* pathfinder with diagonal corner-cut prevention and string-pulling smoothing.
 * Returns a list of waypoints starting AFTER `from` and ending at the reachable goal.
 */
export function findPath(map: GameMap, from: Vec3, to: Vec3): Vec3[] {
  if (canWalkDirect(from, to, map, 0.38, 1.78)) {
    return [vec3(to.x, 0, to.z)];
  }

  const grid = getNavGrid(map);
  const startCell = nearestWalkableCell(grid, from);
  const goalCell = nearestWalkableCell(grid, to);
  if (!startCell || !goalCell) return [];

  const startIdx = startCell.row * grid.cols + startCell.col;
  const goalIdx = goalCell.row * grid.cols + goalCell.col;
  if (startIdx === goalIdx) {
    return [cellCenter(grid, goalCell.col, goalCell.row)];
  }

  const total = grid.cols * grid.rows;
  const gScore = new Float64Array(total).fill(Infinity);
  const fScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  // Compact binary min-heap on `fScore` (tie-broken by cell index for strict determinism).
  const heap: number[] = [startIdx];
  const inHeap = new Uint8Array(total);
  inHeap[startIdx] = 1;
  gScore[startIdx] = 0;
  fScore[startIdx] = Math.hypot(goalCell.col - startCell.col, goalCell.row - startCell.row);

  const less = (a: number, b: number) => {
    const df = (fScore[a] ?? Infinity) - (fScore[b] ?? Infinity);
    return Math.abs(df) > 1e-9 ? df < 0 : a < b;
  };

  const pushHeap = (node: number) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const curNode = heap[i] ?? 0;
      const parNode = heap[parent] ?? 0;
      if (less(curNode, parNode)) {
        heap[parent] = curNode;
        heap[i] = parNode;
        i = parent;
      } else {
        break;
      }
    }
  };

  const popHeap = (): number => {
    const top = heap[0] ?? 0;
    const last = heap.pop() ?? 0;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && less(heap[left] ?? 0, heap[smallest] ?? 0)) smallest = left;
        if (right < heap.length && less(heap[right] ?? 0, heap[smallest] ?? 0)) smallest = right;
        if (smallest !== i) {
          const tmp = heap[i] ?? 0;
          heap[i] = heap[smallest] ?? 0;
          heap[smallest] = tmp;
          i = smallest;
        } else {
          break;
        }
      }
    }
    return top;
  };

  let found = false;
  while (heap.length > 0) {
    const current = popHeap();
    inHeap[current] = 0;
    if (current === goalIdx) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;

    const cc = current % grid.cols;
    const cr = (current - cc) / grid.cols;

    for (const nb of NEIGHBORS) {
      const nc = cc + nb.dc;
      const nr = cr + nb.dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      const nIdx = nr * grid.cols + nc;
      if (closed[nIdx] || !grid.walkable[nIdx]) continue;

      // Prevent diagonal corner-cutting across wall vertices.
      if (nb.dc !== 0 && nb.dr !== 0) {
        const sideA = cr * grid.cols + nc;
        const sideB = nr * grid.cols + cc;
        if (!grid.walkable[sideA] || !grid.walkable[sideB]) continue;
      }

      const tentativeG = (gScore[current] ?? Infinity) + nb.cost + (grid.wallPenalty[nIdx] ?? 0);
      if (tentativeG + 1e-9 < (gScore[nIdx] ?? Infinity)) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        const h = Math.hypot(goalCell.col - nc, goalCell.row - nr);
        fScore[nIdx] = tentativeG + h;
        if (!inHeap[nIdx]) {
          inHeap[nIdx] = 1;
          pushHeap(nIdx);
        } else {
          pushHeap(nIdx);
        }
      }
    }
  }

  if (!found) return [];

  const rawPoints: Vec3[] = [];
  let curr = goalIdx;
  while (curr !== -1 && curr !== startIdx) {
    const c = curr % grid.cols;
    const r = (curr - c) / grid.cols;
    rawPoints.push(cellCenter(grid, c, r));
    curr = cameFrom[curr] ?? -1;
  }
  rawPoints.reverse();

  // Replace final cell center with exact destination if walkable.
  const lastRaw = rawPoints[rawPoints.length - 1];
  if (
    lastRaw &&
    !collidesAt(vec3(to.x, 0, to.z), grid.clearanceRadius, grid.bodyHeight, map.solids) &&
    canWalkDirect(lastRaw, to, map, 0.38, 1.78)
  ) {
    rawPoints[rawPoints.length - 1] = vec3(to.x, 0, to.z);
  }

  // String-pulling LOS smoothing to remove stair-stepping.
  const smoothed: Vec3[] = [];
  let anchor = vec3(from.x, 0, from.z);
  let i = 0;
  while (i < rawPoints.length) {
    let furthest = i;
    for (let j = rawPoints.length - 1; j > i; j--) {
      const candidatePt = rawPoints[j];
      if (candidatePt && canWalkDirect(anchor, candidatePt, map, 0.38, 1.78)) {
        furthest = j;
        break;
      }
    }
    const nextPt = rawPoints[furthest];
    if (!nextPt) break;
    smoothed.push(nextPt);
    anchor = nextPt;
    i = furthest + 1;
  }

  return smoothed;
}

/**
 * Flood-fill reachability from `origin` across the navigation grid.
 * Used by map tests to guarantee every enemy spawn, waypoint, and lane is connected.
 */
export function computeReachableMask(grid: NavGrid, origin: Vec3): Uint8Array {
  const reachable = new Uint8Array(grid.cols * grid.rows);
  const start = nearestWalkableCell(grid, origin, 3);
  if (!start) return reachable;

  const startIdx = start.row * grid.cols + start.col;
  reachable[startIdx] = 1;
  const queue: number[] = [startIdx];
  let head = 0;

  while (head < queue.length) {
    const curr = queue[head++];
    if (curr === undefined) break;
    const cc = curr % grid.cols;
    const cr = (curr - cc) / grid.cols;

    for (const nb of NEIGHBORS) {
      const nc = cc + nb.dc;
      const nr = cr + nb.dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      const nIdx = nr * grid.cols + nc;
      if (reachable[nIdx] || !grid.walkable[nIdx]) continue;
      if (nb.dc !== 0 && nb.dr !== 0) {
        if (!grid.walkable[cr * grid.cols + nc] || !grid.walkable[nr * grid.cols + cc]) continue;
      }
      reachable[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return reachable;
}

/**
 * Find a nearby walkable cover position within `searchRadius` metres of `from` where line-of-sight
 * from standing or crouched eye height to `threatEyePos` is blocked by map geometry.
 */
export function findCoverPosition(
  map: GameMap,
  from: Vec3,
  threatEyePos: Vec3,
  searchRadius = 9.0,
): Vec3 | null {
  const grid = getNavGrid(map);
  const center = worldToCell(grid, from);
  const radCells = Math.ceil(searchRadius / grid.cellSize);

  let bestPos: Vec3 | null = null;
  let bestScore = Infinity;

  for (let dr = -radCells; dr <= radCells; dr++) {
    for (let dc = -radCells; dc <= radCells; dc++) {
      const col = center.col + dc;
      const row = center.row + dr;
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
      const idx = row * grid.cols + col;
      if (!grid.walkable[idx]) continue;

      const candidate = cellCenter(grid, col, row);
      const distFromSelf = Math.hypot(candidate.x - from.x, candidate.z - from.z);
      if (distFromSelf < 1.2 || distFromSelf > searchRadius) continue;

      const distToThreat = Math.hypot(threatEyePos.x - candidate.x, threatEyePos.z - candidate.z);
      if (distToThreat < 3.5) continue;

      // Test whether standing eye (1.58 m) OR crouched cover tuck (1.05 m) is occluded from threat.
      const standEye = vec3(candidate.x, 1.58, candidate.z);
      const crouchEye = vec3(candidate.x, 1.05, candidate.z);

      const occludedStanding = !hasLineOfSight(standEye, threatEyePos, map);
      const occludedCrouched = !hasLineOfSight(crouchEye, threatEyePos, map);
      if (!occludedStanding && !occludedCrouched) continue;

      // Prefer full standing cover close to current position, without corner-hugging penalty.
      const coverBonus = occludedStanding ? 0 : 2.2;
      const score = distFromSelf + coverBonus + (grid.wallPenalty[idx] ?? 0) * 0.8;
      if (score < bestScore) {
        bestScore = score;
        bestPos = candidate;
      }
    }
  }

  return bestPos;
}

export function hasLineOfSight(eyeA: Vec3, eyeB: Vec3, map: GameMap): boolean {
  const dx = eyeB.x - eyeA.x;
  const dy = eyeB.y - eyeA.y;
  const dz = eyeB.z - eyeA.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const dir = vec3(dx / dist, dy / dist, dz / dist);
  const hit = raycast(eyeA, dir, dist - 0.05, map.solids);
  return hit === null;
}
