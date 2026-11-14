/**
 * Hostile combatants: perception, movement, cover, aim, fire and death.
 *
 * Pure and deterministic. Every random value (spread, cover tie-breaks, holdovers) comes
 * from the seed passed in, and every timer is counted down with the fixed `dt`. Enemies use
 * the same rules the player does: they walk through the map's collision boxes, need a clear
 * line of sight to shoot, wait out a fire interval and a reload, and their rifle is hitscan
 * with spread, like the player's guns.
 *
 * Behaviour states:
 *   guard      -> hold the patrol position, sweeping the rifle across its arc
 *   engage     -> the player is in sight: turn, wait out the reaction delay, fire bursts
 *   reposition -> walk a planned route to cover or to the last known position
 *   dead       -> stop moving, aiming and firing; no collision, no further damage
 */

import type { Box } from './collision';
import { bodyBox, moveBody, raycast } from './collision';
import type { GameMap, SurfaceMaterial } from './map';
import type { NavGrid } from './nav';
import { cellCentre, findPath, navGrid, nearestOpenCell } from './nav';
import type { PlayerState } from './player';
import { eyePosition, PLAYER_TUNING } from './player';
import { nextRandom } from './rng';
import type { Vec3 } from './vec';
import { angleDelta, clamp } from './vec';

export type EnemyBehavior = 'guard' | 'engage' | 'reposition' | 'dead';

export const ENEMY_TUNING = {
  maxHealth: 100,
  radius: 0.32,
  height: 1.8,
  /** Eye height used for line of sight and for the muzzle. */
  eyeHeight: 1.58,
  walkSpeed: 3.1,
  /** Radians per second the body turns. */
  turnRate: 3.2,
  /** Radians per second the rifle tracks a target. Slower than a mouse flick on purpose. */
  aimTurnRate: 2.2,
  /** Full field of view, in radians. */
  fieldOfView: 1.75,
  detectionRange: 42,
  /** Seconds of continuous sight before the player is spotted. */
  awarenessSeconds: 0.3,
  /** Extra seconds between spotting and the first shot. */
  reactionSeconds: 0.45,
  fireInterval: 0.16,
  burstLength: 3,
  /** Seconds of rest between bursts. */
  burstPause: 1.55,
  /** Seeded aim error per round, in radians. */
  spread: 0.028,
  damage: 10,
  magazineSize: 30,
  reloadTime: 2.6,
  range: 70,
  /** Seconds the last known player position is still acted on. */
  memorySeconds: 5,
  /** How far away cover is looked for. */
  coverRadius: 17,
  /** Minimum seconds between deliberate repositioning decisions. */
  decisionCooldown: 1.6,
  /** Seconds of blocked walking before a route is abandoned. */
  stuckSeconds: 0.6,
  /** Aim error, in radians, within which a round may be fired. */
  aimTolerance: 0.075,
  /** Distance kept from the player, so a hostile never stands on top of them. */
  standoff: 1.6,
  /** Seconds a hit interrupts a hostile's aim before it breaks for cover. */
  suppressionSeconds: 0.35,
  hitReactionSeconds: 0.25,
} as const;

export const ENEMY_WEAPON = {
  name: 'AK-47',
  caliber: '7.62×39mm',
} as const;

/** Height of the chest aim point above the feet. */
const CHEST_HEIGHT = 1.2;

export interface EnemyState {
  readonly id: number;
  /** Feet position. */
  readonly position: Vec3;
  /** Position and facing the hostile holds when it has nothing better to do. */
  readonly home: Vec3;
  readonly homeYaw: number;
  readonly yaw: number;
  readonly aimYaw: number;
  readonly aimPitch: number;
  readonly health: number;
  readonly behavior: EnemyBehavior;
  /** Seconds spent in the current behaviour. */
  readonly stateTime: number;
  /** True while the player is in sight this step. */
  readonly seen: boolean;
  /** Continuous seconds of sight, for the awareness build-up. */
  readonly visibleFor: number;
  /** Seconds since the player was last visible. */
  readonly unseenFor: number;
  readonly lastKnown: Vec3 | null;
  /** Latched once the hostile has fully spotted the player. */
  readonly aware: boolean;
  readonly reactionTimer: number;
  readonly fireCooldown: number;
  readonly burstLeft: number;
  readonly burstPause: number;
  readonly rounds: number;
  readonly reloadRemaining: number;
  readonly path: readonly Vec3[];
  readonly pathIndex: number;
  readonly destination: Vec3 | null;
  /** Nav cell of the cover point holding, -1 when not in cover. */
  readonly coverCell: number;
  readonly decisionCooldown: number;
  readonly stuckTime: number;
  /** Seconds of hit reaction left, for the view. */
  readonly hitFlash: number;
  /** Seconds of suppression left after taking a hit. */
  readonly alerted: number;
  /** Seconds since death. */
  readonly deadTime: number;
}

export interface EnemyImpact {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly surface: SurfaceMaterial;
}

export type EnemyEvent =
  | {
      readonly type: 'enemy-shot';
      readonly index: number;
      readonly origin: Vec3;
      readonly direction: Vec3;
      readonly impact: EnemyImpact | null;
      readonly playerHit: boolean;
      readonly damage: number;
    }
  | { readonly type: 'enemy-reload'; readonly index: number };

export interface EnemyStep {
  readonly enemies: readonly EnemyState[];
  readonly events: readonly EnemyEvent[];
  readonly seed: number;
}

export function enemyEye(feet: Vec3): Vec3 {
  return { x: feet.x, y: feet.y + ENEMY_TUNING.eyeHeight, z: feet.z };
}

function directionFrom(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: -Math.cos(yaw) * cosPitch };
}

/** The chest point a shooter aims at. Leaning shifts the torso, so this follows the lean. */
export function playerChest(player: PlayerState): Vec3 {
  const eye = eyePosition(player);
  const leanX = (eye.x - player.position.x) * 0.55;
  const leanZ = (eye.z - player.position.z) * 0.55;
  return {
    x: player.position.x + leanX,
    y: player.position.y + CHEST_HEIGHT,
    z: player.position.z + leanZ,
  };
}

/** What a hostile round can hit on the player. The head box follows the leaned eye. */
export function playerHitBoxes(player: PlayerState): { readonly body: Box; readonly head: Box } {
  const eye = eyePosition(player);
  const chest = playerChest(player);
  return {
    body: {
      min: { x: chest.x - 0.26, y: player.position.y + 0.8, z: chest.z - 0.2 },
      max: { x: chest.x + 0.26, y: player.position.y + 1.45, z: chest.z + 0.2 },
    },
    head: {
      min: { x: eye.x - 0.14, y: eye.y - 0.13, z: eye.z - 0.14 },
      max: { x: eye.x + 0.14, y: eye.y + 0.12, z: eye.z + 0.14 },
    },
  };
}

/**
 * What a player round can hit on a hostile. The box stays axis-aligned and a little
 * generous around the rendered torso, so a visual hit is a registered hit without
 * letting shots pass through a body that is standing behind a wall.
 */
export function enemyHitBoxes(enemy: EnemyState): { readonly body: Box; readonly head: Box } {
  const { x, y, z } = enemy.position;
  return {
    body: {
      min: { x: x - 0.27, y: y + 0.72, z: z - 0.21 },
      max: { x: x + 0.27, y: y + 1.5, z: z + 0.21 },
    },
    head: {
      min: { x: x - 0.14, y: y + 1.5, z: z - 0.14 },
      max: { x: x + 0.14, y: y + 1.79, z: z + 0.14 },
    },
  };
}

/** Collision box a living hostile presents to the player. Dead ones do not block. */
export function enemyBlocker(enemy: EnemyState): Box {
  return bodyBox(enemy.position, ENEMY_TUNING.radius, ENEMY_TUNING.height);
}

export function isEnemyAlive(enemy: EnemyState): boolean {
  return enemy.behavior !== 'dead';
}

function createEnemy(spawn: { position: Vec3; yaw: number }, id: number): EnemyState {
  return {
    id,
    position: { ...spawn.position },
    home: { ...spawn.position },
    homeYaw: spawn.yaw,
    yaw: spawn.yaw,
    aimYaw: spawn.yaw,
    aimPitch: 0,
    health: ENEMY_TUNING.maxHealth,
    behavior: 'guard',
    stateTime: 0,
    seen: false,
    visibleFor: 0,
    unseenFor: ENEMY_TUNING.memorySeconds,
    lastKnown: null,
    aware: false,
    reactionTimer: 0,
    fireCooldown: 0,
    burstLeft: ENEMY_TUNING.burstLength,
    burstPause: 0,
    rounds: ENEMY_TUNING.magazineSize,
    reloadRemaining: 0,
    path: [],
    pathIndex: 0,
    destination: null,
    coverCell: -1,
    decisionCooldown: 0,
    stuckTime: 0,
    hitFlash: 0,
    alerted: 0,
    deadTime: 0,
  };
}

/**
 * Gunfire is loud. Hostiles within earshot turn toward the shot and go looking for its
 * source, but they are not told whether anything is in sight: they still have to find and
 * see the player, and they cannot shoot through the wall they heard it through.
 */
export function hearGunshot(
  enemies: readonly EnemyState[],
  shot: Vec3,
  radius = 30,
): readonly EnemyState[] {
  return enemies.map((enemy) => {
    if (!isEnemyAlive(enemy)) return enemy;
    const distance = Math.hypot(enemy.position.x - shot.x, enemy.position.z - shot.z);
    if (distance > radius) return enemy;
    const target = enemy.seen ? enemy.lastKnown : { ...shot };
    const looking = enemy.behavior === 'guard' && !enemy.aware;
    const yaw = Math.atan2(
      enemy.position.x - (target?.x ?? shot.x),
      enemy.position.z - (target?.z ?? shot.z),
    );
    return {
      ...enemy,
      aware: true,
      lastKnown: target,
      ...(looking
        ? {
            behavior: 'engage' as const,
            stateTime: 0,
            reactionTimer: ENEMY_TUNING.reactionSeconds,
            yaw,
            aimYaw: yaw,
          }
        : {}),
    };
  });
}

export function createEnemies(map: GameMap): readonly EnemyState[] {
  return map.enemySpawns.map((spawn, id) => createEnemy(spawn, id));
}

/**
 * Apply damage once, bound it, and react. A hostile that is hit knows roughly where the
 * round came from, so it turns and returns fire instead of standing still; it still needs
 * line of sight before it can shoot back. Dead hostiles ignore further hits.
 */
export function hitEnemy(enemy: EnemyState, damage: number, threat?: Vec3): EnemyState {
  if (!isEnemyAlive(enemy) || damage <= 0) return enemy;
  const health = Math.max(0, enemy.health - damage);
  if (health === 0) {
    return {
      ...enemy,
      health,
      behavior: 'dead',
      deadTime: 0,
      path: [],
      pathIndex: 0,
      destination: null,
      seen: false,
      alerted: 0,
      stuckTime: 0,
      decisionCooldown: 0,
    };
  }
  const interrupted = enemy.behavior === 'guard' || enemy.behavior === 'reposition';
  const threatYaw = threat
    ? Math.atan2(enemy.position.x - threat.x, enemy.position.z - threat.z)
    : enemy.yaw;
  return {
    ...enemy,
    health,
    hitFlash: ENEMY_TUNING.hitReactionSeconds,
    alerted: ENEMY_TUNING.suppressionSeconds + ENEMY_TUNING.decisionCooldown,
    aware: true,
    lastKnown: threat ?? enemy.lastKnown,
    // The round came from somewhere: flinch round to face it and reply.
    yaw: interrupted && threat ? threatYaw : enemy.yaw,
    aimYaw: interrupted && threat ? threatYaw : enemy.aimYaw,
    ...(interrupted && threat
      ? {
          behavior: 'engage' as const,
          stateTime: 0,
          reactionTimer: ENEMY_TUNING.hitReactionSeconds,
          path: [],
          pathIndex: 0,
          destination: null,
        }
      : {}),
  };
}

function canSeePlayer(enemy: EnemyState, player: PlayerState, map: GameMap): boolean {
  const eye = enemyEye(enemy.position);
  const chest = playerChest(player);
  const dx = chest.x - eye.x;
  const dy = chest.y - eye.y;
  const dz = chest.z - eye.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance > ENEMY_TUNING.detectionRange || distance < 1e-4) return false;
  const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
  const facing = directionFrom(enemy.yaw, 0);
  const facingDot = facing.x * direction.x + facing.z * direction.z;
  if (facingDot < Math.cos(ENEMY_TUNING.fieldOfView / 2)) return false;
  return raycast(eye, direction, distance - 0.25, map.solids) === null;
}

function turnToward(current: number, wanted: number, maxDelta: number): number {
  return current + clamp(angleDelta(current, wanted), -maxDelta, maxDelta);
}

function aimAt(enemy: EnemyState, point: Vec3, dt: number): { aimYaw: number; aimPitch: number } {
  const eye = enemyEye(enemy.position);
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const wantedYaw = Math.atan2(-dx, -dz);
  const wantedPitch = Math.atan2(dy, Math.hypot(dx, dz));
  const step = ENEMY_TUNING.aimTurnRate * dt;
  return {
    aimYaw: turnToward(enemy.aimYaw, wantedYaw, step),
    aimPitch: enemy.aimPitch + clamp(wantedPitch - enemy.aimPitch, -step, step),
  };
}

/** True when the rifle is pointing close enough to the target to take the shot. */
function alignedWith(enemy: EnemyState, point: Vec3): boolean {
  const eye = enemyEye(enemy.position);
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const wantedYaw = Math.atan2(-dx, -dz);
  const wantedPitch = Math.atan2(dy, Math.hypot(dx, dz));
  return (
    Math.abs(angleDelta(enemy.aimYaw, wantedYaw)) < ENEMY_TUNING.aimTolerance &&
    Math.abs(wantedPitch - enemy.aimPitch) < ENEMY_TUNING.aimTolerance
  );
}

interface CoverChoice {
  readonly point: Vec3;
  readonly path: readonly Vec3[];
  readonly cell: number;
}

/**
 * A reachable spot that puts a solid between the hostile and the player, at a useful
 * distance. The last cover used is never picked again while it is still an option, which is
 * what stops two equally good spots from trading places forever.
 */
function chooseCover(
  map: GameMap,
  grid: NavGrid,
  enemy: EnemyState,
  threat: Vec3,
  seed: number,
): { choice: CoverChoice | null; seed: number } {
  const threatEye = { x: threat.x, y: threat.y + PLAYER_TUNING.eyeHeight, z: threat.z };
  const origin = nearestOpenCell(grid, map, enemy.position.x, enemy.position.z);
  const cellsFrom = Math.ceil(ENEMY_TUNING.coverRadius / 0.45);
  const stride = 3;
  const options: { cell: number; distance: number; score: number }[] = [];

  const originI = origin % grid.width;
  const originJ = Math.floor(origin / grid.width);

  let localSeed = seed;
  for (let dj = -cellsFrom; dj <= cellsFrom; dj += stride) {
    for (let di = -cellsFrom; di <= cellsFrom; di += stride) {
      const i = originI + di;
      const j = originJ + dj;
      if (i < 1 || j < 1 || i >= grid.width - 1 || j >= grid.depth - 1) continue;
      const cell = j * grid.width + i;
      if (!grid.open[cell] || cell === enemy.coverCell) continue;
      const centre = cellCentre(grid, cell);
      const fromEnemy = Math.hypot(centre.x - enemy.position.x, centre.z - enemy.position.z);
      if (fromEnemy < 2.5 || fromEnemy > ENEMY_TUNING.coverRadius) continue;
      const fromThreat = Math.hypot(centre.x - threat.x, centre.z - threat.z);
      if (fromThreat < 6) continue;

      const coverPoint = { x: centre.x, y: 1.1, z: centre.z };
      const dx = coverPoint.x - threatEye.x;
      const dy = coverPoint.y - threatEye.y;
      const dz = coverPoint.z - threatEye.z;
      const distance = Math.hypot(dx, dy, dz);
      const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
      // Only count a spot as cover if the player's line of sight to it is broken.
      if (raycast(threatEye, direction, distance - 0.3, map.solids) === null) continue;

      const roll = nextRandom(localSeed);
      localSeed = roll.seed;
      options.push({
        cell,
        distance: fromEnemy,
        score: fromEnemy * 0.35 + Math.abs(fromThreat - 13) * 0.4 + roll.value * 0.8,
      });
    }
  }

  options.sort((a, b) => a.score - b.score || a.cell - b.cell);
  for (const option of options.slice(0, 6)) {
    const point = cellCentre(grid, option.cell);
    const path = findPath(grid, map, enemy.position, point);
    if (path.length === 0) continue;
    return {
      choice: { point: { x: point.x, y: 0, z: point.z }, path, cell: option.cell },
      seed: localSeed,
    };
  }
  return { choice: null, seed: localSeed };
}

interface Movement {
  readonly position: Vec3;
  readonly stuck: boolean;
}

/** Walk one step toward the current waypoint, sliding along walls like the player does. */
function walkPath(
  enemy: EnemyState,
  map: GameMap,
  dt: number,
  speed: number,
): Movement & { pathIndex: number; path: readonly Vec3[] } {
  const waypoint = enemy.path[enemy.pathIndex];
  if (!waypoint) return { position: enemy.position, stuck: false, pathIndex: 0, path: [] };

  const dx = waypoint.x - enemy.position.x;
  const dz = waypoint.z - enemy.position.z;
  const distance = Math.hypot(dx, dz);
  let pathIndex = enemy.pathIndex;
  if (distance < 0.35) {
    pathIndex += 1;
    if (pathIndex >= enemy.path.length) {
      return { position: enemy.position, stuck: false, pathIndex: 0, path: [] };
    }
  }

  const nextWaypoint = enemy.path[pathIndex];
  if (!nextWaypoint) return { position: enemy.position, stuck: false, pathIndex: 0, path: [] };
  const ndx = nextWaypoint.x - enemy.position.x;
  const ndz = nextWaypoint.z - enemy.position.z;
  const nd = Math.hypot(ndx, ndz) || 1;
  const step = speed * dt;
  const moved = moveBody(
    enemy.position,
    { x: (ndx / nd) * step, y: 0, z: (ndz / nd) * step },
    ENEMY_TUNING.radius,
    ENEMY_TUNING.height,
    map.solids,
  );
  const actual = Math.hypot(
    moved.position.x - enemy.position.x,
    moved.position.z - enemy.position.z,
  );
  return {
    position: moved.position,
    stuck: moved.hitX || moved.hitZ || actual < step * 0.35,
    pathIndex,
    path: enemy.path,
  };
}

/** Push apart bodies that would otherwise stand inside each other. */
function separation(enemy: EnemyState, all: readonly EnemyState[], player: PlayerState): Vec3 {
  let pushX = 0;
  let pushZ = 0;
  for (const other of all) {
    if (other.id === enemy.id || !isEnemyAlive(other)) continue;
    const dx = enemy.position.x - other.position.x;
    const dz = enemy.position.z - other.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1.1 || distance < 1e-4) continue;
    pushX += (dx / distance) * (1.1 - distance);
    pushZ += (dz / distance) * (1.1 - distance);
  }
  const pdx = enemy.position.x - player.position.x;
  const pdz = enemy.position.z - player.position.z;
  const pd = Math.hypot(pdx, pdz);
  if (pd < ENEMY_TUNING.standoff && pd > 1e-4) {
    pushX += (pdx / pd) * (ENEMY_TUNING.standoff - pd);
    pushZ += (pdz / pd) * (ENEMY_TUNING.standoff - pd);
  }
  return { x: pushX * 2.2, y: 0, z: pushZ * 2.2 };
}

function withPath(enemy: EnemyState, plan: CoverChoice): EnemyState {
  return {
    ...enemy,
    behavior: 'reposition',
    stateTime: 0,
    path: plan.path,
    pathIndex: 0,
    destination: plan.point,
    coverCell: plan.cell,
    decisionCooldown: ENEMY_TUNING.decisionCooldown,
    stuckTime: 0,
  };
}

function stepEnemy(
  enemy: EnemyState,
  all: readonly EnemyState[],
  player: PlayerState,
  map: GameMap,
  grid: NavGrid,
  dt: number,
  seed: number,
): { enemy: EnemyState; events: EnemyEvent[]; seed: number } {
  const events: EnemyEvent[] = [];

  if (!isEnemyAlive(enemy)) {
    return {
      enemy: { ...enemy, deadTime: enemy.deadTime + dt },
      events,
      seed,
    };
  }

  let draft = enemy;
  let localSeed = seed;

  const chest = playerChest(player);
  const sees = canSeePlayer(draft, player, map);
  const visibleFor = sees ? draft.visibleFor + dt : 0;
  const unseenFor = sees ? 0 : draft.unseenFor + dt;
  const lastKnown = sees ? { ...player.position } : draft.lastKnown;
  const aware = draft.aware || (sees && visibleFor >= ENEMY_TUNING.awarenessSeconds);

  draft = {
    ...draft,
    seen: sees,
    visibleFor,
    unseenFor,
    lastKnown,
    aware,
    stateTime: draft.stateTime + dt,
    reactionTimer: Math.max(0, draft.reactionTimer - (sees ? dt : 0)),
    fireCooldown: Math.max(0, draft.fireCooldown - dt),
    burstPause: Math.max(0, draft.burstPause - dt),
    decisionCooldown: Math.max(0, draft.decisionCooldown - dt),
    hitFlash: Math.max(0, draft.hitFlash - dt),
    alerted: Math.max(0, draft.alerted - dt),
  };

  if (draft.reloadRemaining > 0) {
    const reloadRemaining = Math.max(0, draft.reloadRemaining - dt);
    draft = {
      ...draft,
      reloadRemaining,
      rounds: reloadRemaining === 0 ? ENEMY_TUNING.magazineSize : draft.rounds,
    };
  }
  if (draft.burstLeft === 0 && draft.burstPause === 0) {
    draft = { ...draft, burstLeft: ENEMY_TUNING.burstLength };
  }

  // --- Behaviour transitions ---------------------------------------------------------
  if (draft.behavior === 'guard') {
    if (sees && visibleFor >= ENEMY_TUNING.awarenessSeconds) {
      draft = {
        ...draft,
        behavior: 'engage',
        stateTime: 0,
        reactionTimer: ENEMY_TUNING.reactionSeconds,
        path: [],
        pathIndex: 0,
        destination: null,
      };
    } else {
      // Sweep the arc around the patrol facing while nothing is happening.
      const phase = draft.id * 1.7;
      draft = {
        ...draft,
        yaw: turnToward(
          draft.yaw,
          draft.homeYaw + Math.sin((draft.stateTime + phase) * 0.55) * 0.55,
          ENEMY_TUNING.turnRate * dt,
        ),
        aimYaw: turnToward(
          draft.aimYaw,
          draft.homeYaw + Math.sin((draft.stateTime + phase) * 0.55) * 0.55,
          ENEMY_TUNING.turnRate * dt,
        ),
        aimPitch: draft.aimPitch + clamp(-0.02 - draft.aimPitch, -0.6 * dt, 0.6 * dt),
      };
    }
  }

  if (draft.behavior === 'engage') {
    const target = sees ? chest : null;
    if (target) {
      draft = { ...draft, ...aimAt(draft, target, dt) };
      draft = {
        ...draft,
        yaw: turnToward(draft.yaw, draft.aimYaw, ENEMY_TUNING.turnRate * dt),
      };
    } else if (lastKnown) {
      const eye = enemyEye(draft.position);
      const wanted = Math.atan2(-(lastKnown.x - eye.x), -(lastKnown.z - eye.z));
      draft = { ...draft, yaw: turnToward(draft.yaw, wanted, ENEMY_TUNING.turnRate * dt) };
    }

    const shouldBreakForCover =
      draft.alerted > 0 &&
      draft.stateTime > ENEMY_TUNING.suppressionSeconds &&
      draft.decisionCooldown === 0;
    const lostPlayer = !sees && unseenFor > ENEMY_TUNING.memorySeconds && lastKnown !== null;

    if (shouldBreakForCover) {
      const threat = lastKnown ?? player.position;
      const { choice, seed: nextSeed } = chooseCover(map, grid, draft, threat, localSeed);
      localSeed = nextSeed;
      if (choice) draft = withPath(draft, choice);
    } else if (lostPlayer && draft.decisionCooldown === 0) {
      const path = findPath(grid, map, draft.position, lastKnown);
      if (path.length > 0) {
        draft = {
          ...draft,
          behavior: 'reposition',
          stateTime: 0,
          path,
          pathIndex: 0,
          destination: { ...lastKnown },
          decisionCooldown: ENEMY_TUNING.decisionCooldown,
          stuckTime: 0,
        };
      } else {
        draft = { ...draft, behavior: 'guard', stateTime: 0, path: [], pathIndex: 0 };
      }
    }
  }

  if (draft.behavior === 'reposition') {
    const strafing = sees && draft.rounds > 0 && draft.reloadRemaining === 0;
    const speed = strafing ? ENEMY_TUNING.walkSpeed * 0.55 : ENEMY_TUNING.walkSpeed;
    const moved = walkPath(draft, map, dt, speed);
    const push = separation(draft, all, player);
    const pushed = moveBody(
      moved.position,
      { x: push.x * dt, y: 0, z: push.z * dt },
      ENEMY_TUNING.radius,
      ENEMY_TUNING.height,
      map.solids,
    );
    const stuckTime = moved.stuck ? draft.stuckTime + dt : 0;
    const finished = moved.path.length === 0;
    const heading =
      moved.path.length > 0
        ? (moved.path[moved.pathIndex] ?? moved.path[moved.path.length - 1])
        : null;
    const travelYaw = heading
      ? Math.atan2(-(heading.x - pushed.position.x), -(heading.z - pushed.position.z))
      : draft.yaw;
    draft = {
      ...draft,
      position: pushed.position,
      path: moved.path,
      pathIndex: moved.pathIndex,
      stuckTime,
      yaw: turnToward(draft.yaw, travelYaw, ENEMY_TUNING.turnRate * dt),
    };

    if (sees) {
      draft = { ...draft, ...aimAt(draft, chest, dt) };
    }

    if (stuckTime > ENEMY_TUNING.stuckSeconds) {
      draft = {
        ...draft,
        behavior: 'guard',
        stateTime: 0,
        path: [],
        pathIndex: 0,
        destination: null,
        stuckTime: 0,
        decisionCooldown: ENEMY_TUNING.decisionCooldown,
        home: { ...draft.position },
        homeYaw: draft.yaw,
      };
    } else if (finished) {
      draft = {
        ...draft,
        behavior: sees ? 'engage' : 'guard',
        stateTime: 0,
        reactionTimer: sees ? ENEMY_TUNING.reactionSeconds * 0.5 : 0,
        home: { ...draft.position },
        homeYaw: draft.yaw,
      };
    }
  }

  // --- Reload -------------------------------------------------------------------------
  if (
    draft.reloadRemaining === 0 &&
    draft.rounds < ENEMY_TUNING.magazineSize &&
    (draft.rounds === 0 || (!sees && draft.behavior !== 'dead'))
  ) {
    draft = { ...draft, reloadRemaining: ENEMY_TUNING.reloadTime };
    events.push({ type: 'enemy-reload', index: draft.id });
  }

  // --- Fire ---------------------------------------------------------------------------
  const canFire =
    sees &&
    (draft.behavior === 'engage' || draft.behavior === 'reposition') &&
    draft.rounds > 0 &&
    draft.reloadRemaining === 0 &&
    draft.reactionTimer === 0 &&
    draft.fireCooldown === 0 &&
    draft.burstPause === 0 &&
    draft.burstLeft > 0 &&
    alignedWith(draft, chest);

  if (canFire) {
    const origin = enemyEye(draft.position);
    const yawRoll = nextRandom(localSeed);
    const pitchRoll = nextRandom(yawRoll.seed);
    localSeed = pitchRoll.seed;
    const yaw = draft.aimYaw + (yawRoll.value * 2 - 1) * ENEMY_TUNING.spread;
    const pitch = draft.aimPitch + (pitchRoll.value * 2 - 1) * ENEMY_TUNING.spread;
    const direction = directionFrom(yaw, pitch);

    const boxes = playerHitBoxes(player);
    const rayBoxes: Box[] = [boxes.body, boxes.head, ...map.solids];
    const hit = raycast(origin, direction, ENEMY_TUNING.range, rayBoxes);
    const playerHit = hit !== null && hit.index < 2;
    const impact =
      hit && !playerHit
        ? {
            point: {
              x: origin.x + direction.x * hit.distance,
              y: origin.y + direction.y * hit.distance,
              z: origin.z + direction.z * hit.distance,
            },
            normal: hit.normal,
            distance: hit.distance,
            surface: map.solids[hit.index - 2]?.material ?? 'concrete',
          }
        : null;

    events.push({
      type: 'enemy-shot',
      index: draft.id,
      origin,
      direction,
      impact,
      playerHit,
      damage: playerHit ? ENEMY_TUNING.damage : 0,
    });

    const burstLeft = draft.burstLeft - 1;
    draft = {
      ...draft,
      rounds: draft.rounds - 1,
      burstLeft,
      burstPause: burstLeft === 0 ? ENEMY_TUNING.burstPause : 0,
      fireCooldown: ENEMY_TUNING.fireInterval,
    };
  }

  return { enemy: draft, events, seed: localSeed };
}

/**
 * Advance every hostile by one fixed step. Movement is resolved against the map's solids,
 * rounds are traced against the player and the map, and a hostile that cannot see the player
 * never fires.
 */
export function stepEnemies(
  enemies: readonly EnemyState[],
  player: PlayerState,
  map: GameMap,
  dt: number,
  seed: number,
): EnemyStep {
  const grid = navGrid(map);
  const events: EnemyEvent[] = [];
  let nextSeed = seed;
  const next = enemies.map((enemy) => {
    const step = stepEnemy(enemy, enemies, player, map, grid, dt, nextSeed);
    nextSeed = step.seed;
    events.push(...step.events);
    return step.enemy;
  });
  return { enemies: next, events, seed: nextSeed };
}
