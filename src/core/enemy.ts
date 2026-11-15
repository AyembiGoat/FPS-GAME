/**
 * Deterministic single-player AI enemy combatant simulation.
 *
 * Pure: no Three.js, DOM, wall-clock, or Math.random. Uses explicit `SeededRng`
 * and `GameMap` axis-aligned solid collision + precomputed `nav.ts` A* pathing.
 */

import type { Box } from './collision';
import { moveBody, raycast } from './collision';
import type { EnemyArchetype, EnemySpawn, GameMap } from './map';
import type { DifficultyTuning } from './modes';
import { findCoverPosition, findPath, hasLineOfSight } from './nav';
import { PLAYER_TUNING } from './player';
import type { SeededRng } from './rng';
import type { Vec3 } from './vec';
import { add, angleDelta, clamp, scale, vec3 } from './vec';
import type { WeaponId } from './weapon';
import { getWeaponSpec, weaponProjectileDamage } from './weapon';

export type EnemyAiState = 'patrol' | 'alert' | 'engage' | 'cover' | 'investigate' | 'dead';
export type HitZone = 'head' | 'torso' | 'legs';

export const ENEMY_BODY = {
  radius: 0.34,
  standingHeight: 1.78,
  crouchedHeight: 1.38,
  eyeHeightStanding: 1.6,
  eyeHeightCrouched: 1.12,
  muzzleHeightStanding: 1.38,
  muzzleHeightCrouched: 0.98,
  headHalfWidth: 0.15,
  torsoHalfWidth: 0.25,
  legsHalfWidth: 0.23,
  maxHealth: 100,
} as const;

export interface EnemyState {
  readonly id: string;
  readonly archetype: EnemyArchetype;
  readonly weaponId: WeaponId;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly crouched: boolean;
  readonly aiState: EnemyAiState;
  readonly patrol: readonly Vec3[];
  readonly patrolIndex: number;
  readonly path: readonly Vec3[];
  readonly pathGoal: Vec3 | null;
  readonly lastKnownPlayerPos: Vec3 | null;
  readonly memoryRemaining: number;
  readonly canSeePlayer: boolean;
  /** Seconds left before the enemy may open fire after acquiring LOS. */
  readonly reactionRemaining: number;
  /** Rounds left in current magazine. */
  readonly rounds: number;
  /** Seconds left until next shot in current burst. */
  readonly fireCooldown: number;
  /** Seconds left in an active magazine reload (0 when ready). */
  readonly reloadRemaining: number;
  /** Remaining rounds to fire in the current controlled burst. */
  readonly burstRemaining: number;
  /** Pause between bursts so AI fires realistic volleys rather than endless streams. */
  readonly burstPauseRemaining: number;
  /** Seconds exposed in continuous combat before considering a cover rotation. */
  readonly exposureTimer: number;
  /** Cooldown before seeking a new cover point so AI never oscillates. */
  readonly coverCooldown: number;
  /** Strafe direction (+1 right, -1 left) & timer while engaging. */
  readonly strafeSign: -1 | 1;
  readonly strafeTimer: number;
  /** Stuck detection anchor & timer. */
  readonly progressAnchor: Vec3;
  readonly stuckTimer: number;
  /** Visual animation timers (`0..1` normalized decay) read by `src/game/enemies.ts`. */
  readonly hitReact: number;
  readonly muzzleFlash: number;
  /** Seconds since death (`0` while alive, counts up to `1.0` for collapse pose). */
  readonly deathProgress: number;
  /** Deterministic gait phase in radians accumulated from horizontal ground speed. */
  readonly walkPhase: number;
}

export interface EnemyHitboxSet {
  readonly head: Box;
  readonly torso: Box;
  readonly legs: Box;
}

/** Exact axis-aligned hitboxes aligned with the rendered 3D enemy operator in `enemies.ts`. */
export function enemyHitboxes(enemy: EnemyState): EnemyHitboxSet {
  const { x, y, z } = enemy.position;
  if (enemy.crouched) {
    return {
      legs: {
        min: { x: x - ENEMY_BODY.legsHalfWidth, y, z: z - ENEMY_BODY.legsHalfWidth },
        max: { x: x + ENEMY_BODY.legsHalfWidth, y: y + 0.62, z: z + ENEMY_BODY.legsHalfWidth },
      },
      torso: {
        min: { x: x - ENEMY_BODY.torsoHalfWidth, y: y + 0.62, z: z - ENEMY_BODY.torsoHalfWidth },
        max: { x: x + ENEMY_BODY.torsoHalfWidth, y: y + 1.1, z: z + ENEMY_BODY.torsoHalfWidth },
      },
      head: {
        min: { x: x - ENEMY_BODY.headHalfWidth, y: y + 1.1, z: z - ENEMY_BODY.headHalfWidth },
        max: { x: x + ENEMY_BODY.headHalfWidth, y: y + 1.38, z: z + ENEMY_BODY.headHalfWidth },
      },
    };
  }
  return {
    legs: {
      min: { x: x - ENEMY_BODY.legsHalfWidth, y, z: z - ENEMY_BODY.legsHalfWidth },
      max: { x: x + ENEMY_BODY.legsHalfWidth, y: y + 0.88, z: z + ENEMY_BODY.legsHalfWidth },
    },
    torso: {
      min: { x: x - ENEMY_BODY.torsoHalfWidth, y: y + 0.88, z: z - ENEMY_BODY.torsoHalfWidth },
      max: { x: x + ENEMY_BODY.torsoHalfWidth, y: y + 1.48, z: z + ENEMY_BODY.torsoHalfWidth },
    },
    head: {
      min: { x: x - ENEMY_BODY.headHalfWidth, y: y + 1.48, z: z - ENEMY_BODY.headHalfWidth },
      max: { x: x + ENEMY_BODY.headHalfWidth, y: y + 1.78, z: z + ENEMY_BODY.headHalfWidth },
    },
  };
}

export interface EnemyRayHit {
  readonly enemyIndex: number;
  readonly enemyId: string;
  readonly zone: HitZone;
  readonly distance: number;
  readonly point: Vec3;
  readonly normal: Vec3;
}

/**
 * Raycast against all LIVE enemies up to `maxDistance` (caller passes `wallDistance` as `maxDistance`
 * so walls strictly occlude enemies behind cover). Dead enemies are never hit.
 */
export function raycastEnemies(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  enemies: readonly EnemyState[],
): EnemyRayHit | null {
  let best: EnemyRayHit | null = null;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || !enemy.alive) continue;

    const boxes = enemyHitboxes(enemy);
    const zoneEntries: readonly { readonly zone: HitZone; readonly box: Box }[] = [
      { zone: 'head', box: boxes.head },
      { zone: 'torso', box: boxes.torso },
      { zone: 'legs', box: boxes.legs },
    ];

    for (const entry of zoneEntries) {
      const hit = raycast(origin, direction, maxDistance, [entry.box]);
      if (!hit) continue;
      if (!best || hit.distance < best.distance) {
        best = {
          enemyIndex: i,
          enemyId: enemy.id,
          zone: entry.zone,
          distance: hit.distance,
          point: add(origin, scale(direction, hit.distance)),
          normal: hit.normal,
        };
      }
    }
  }

  return best;
}

export function createEnemy(spawn: EnemySpawn): EnemyState {
  const spec = getWeaponSpec(spawn.weaponId);
  return {
    id: spawn.id,
    archetype: spawn.archetype,
    weaponId: spawn.weaponId,
    position: spawn.position,
    velocity: vec3(0, 0, 0),
    yaw: spawn.yaw,
    pitch: 0,
    health: ENEMY_BODY.maxHealth,
    maxHealth: ENEMY_BODY.maxHealth,
    alive: true,
    crouched: false,
    aiState: 'patrol',
    patrol: spawn.patrol.length > 0 ? spawn.patrol : [spawn.position],
    patrolIndex: 0,
    path: [],
    pathGoal: null,
    lastKnownPlayerPos: null,
    memoryRemaining: 0,
    canSeePlayer: false,
    reactionRemaining: 0.4,
    rounds: spec.magazineSize,
    fireCooldown: 0,
    reloadRemaining: 0,
    burstRemaining: 0,
    burstPauseRemaining: 0,
    exposureTimer: 0,
    coverCooldown: 0,
    strafeSign: 1,
    strafeTimer: 1.2,
    progressAnchor: spawn.position,
    stuckTimer: 0,
    hitReact: 0,
    muzzleFlash: 0,
    deathProgress: 0,
    walkPhase: 0,
  };
}

/** Apply damage to a live enemy and wake its perception toward `attackerPos` immediately. */
export function damageEnemy(
  enemy: EnemyState,
  amount: number,
  attackerPos: Vec3,
  tuning: DifficultyTuning,
): { readonly enemy: EnemyState; readonly killed: boolean } {
  if (!enemy.alive || amount <= 0) return { enemy, killed: false };
  const nextHealth = Math.max(0, enemy.health - amount);
  if (nextHealth <= 0) {
    return {
      enemy: {
        ...enemy,
        health: 0,
        alive: false,
        crouched: false,
        velocity: vec3(0, 0, 0),
        aiState: 'dead',
        canSeePlayer: false,
        reloadRemaining: 0,
        burstRemaining: 0,
        hitReact: 1,
        muzzleFlash: 0,
        deathProgress: 0.01,
      },
      killed: true,
    };
  }

  // Being shot immediately alerts the combatant to the shooter's location; if hurt badly, favors cover.
  const shouldSeekCover =
    nextHealth <= enemy.maxHealth * 0.58 && enemy.coverCooldown <= 0 && enemy.aiState !== 'cover';
  const nextAiState: EnemyAiState = shouldSeekCover
    ? 'cover'
    : enemy.aiState === 'patrol' || enemy.aiState === 'investigate'
      ? 'alert'
      : enemy.aiState;

  return {
    enemy: {
      ...enemy,
      health: nextHealth,
      aiState: nextAiState,
      lastKnownPlayerPos: attackerPos,
      memoryRemaining: tuning.memoryDuration,
      reactionRemaining: Math.min(enemy.reactionRemaining, tuning.reactionTime * 0.65),
      hitReact: 1,
    },
    killed: false,
  };
}

/** Alert unengaged enemies within `gunshotAlertRange` when the player fires unsuppressed shots. */
export function alertEnemiesByGunshot(
  enemies: readonly EnemyState[],
  shotOrigin: Vec3,
  tuning: DifficultyTuning,
): EnemyState[] {
  return enemies.map((e) => {
    if (!e.alive) return e;
    const dist = Math.hypot(shotOrigin.x - e.position.x, shotOrigin.z - e.position.z);
    if (dist > tuning.gunshotAlertRange) return e;
    if (e.aiState === 'engage' || e.aiState === 'cover') {
      return {
        ...e,
        lastKnownPlayerPos: shotOrigin,
        memoryRemaining: Math.max(e.memoryRemaining, tuning.memoryDuration * 0.8),
      };
    }
    return {
      ...e,
      aiState: 'alert',
      lastKnownPlayerPos: shotOrigin,
      memoryRemaining: tuning.memoryDuration,
      reactionRemaining: Math.max(e.reactionRemaining, tuning.reactionTime),
    };
  });
}

export interface EnemyShotResult {
  readonly enemyId: string;
  readonly weaponId: WeaponId;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly endPoint: Vec3;
  readonly hitPlayer: boolean;
  readonly damageToPlayer: number;
  readonly surfaceHitNormal: Vec3 | null;
}

export interface EnemiesStepContext {
  readonly map: GameMap;
  readonly playerFeet: Vec3;
  readonly playerEye: Vec3;
  readonly playerAlive: boolean;
  readonly tuning: DifficultyTuning;
  readonly dt: number;
  readonly rng: SeededRng;
}

function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

function desiredAnglesToward(
  from: Vec3,
  target: Vec3,
): { readonly yaw: number; readonly pitch: number } {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  const pitch = clamp(Math.atan2(dy, Math.max(1e-4, horiz)), -1.1, 1.1);
  return { yaw, pitch };
}

function enemyEyePos(enemy: EnemyState): Vec3 {
  const h = enemy.crouched ? ENEMY_BODY.eyeHeightCrouched : ENEMY_BODY.eyeHeightStanding;
  return vec3(enemy.position.x, enemy.position.y + h, enemy.position.z);
}

function enemyMuzzlePos(enemy: EnemyState): Vec3 {
  const h = enemy.crouched ? ENEMY_BODY.muzzleHeightCrouched : ENEMY_BODY.muzzleHeightStanding;
  const fwd = forwardFromAngles(enemy.yaw, enemy.pitch);
  return vec3(
    enemy.position.x + fwd.x * 0.42,
    enemy.position.y + h,
    enemy.position.z + fwd.z * 0.42,
  );
}

function canEnemyPerceivePlayer(
  enemy: EnemyState,
  playerEye: Vec3,
  playerAlive: boolean,
  map: GameMap,
  tuning: DifficultyTuning,
): boolean {
  if (!playerAlive) return false;
  const eye = enemyEyePos(enemy);
  const dx = playerEye.x - eye.x;
  const dy = playerEye.y - eye.y;
  const dz = playerEye.z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > tuning.visionRange) return false;

  // Already alerted/engaged combatants actively track broader awareness; unalerted use FOV cone + close sense.
  const wideAlert = enemy.aiState !== 'patrol';
  if (!wideAlert && dist > tuning.peripheralRange) {
    const look = forwardFromAngles(enemy.yaw, 0);
    const invH = 1 / Math.max(1e-4, Math.hypot(dx, dz));
    const dot = look.x * (dx * invH) + look.z * (dz * invH);
    const cosHalf = Math.cos((tuning.visionFovDeg * 0.5 * Math.PI) / 180);
    if (dot < cosHalf) return false;
  }

  return hasLineOfSight(eye, playerEye, map);
}

function archetypePreferredRange(archetype: EnemyArchetype): {
  readonly minDist: number;
  readonly idealDist: number;
  readonly maxDist: number;
  readonly speedMul: number;
} {
  switch (archetype) {
    case 'breacher':
      return { minDist: 4.5, idealDist: 9.0, maxDist: 16.0, speedMul: 1.08 };
    case 'marksman':
      return { minDist: 14.0, idealDist: 26.0, maxDist: 44.0, speedMul: 0.92 };
    case 'assaulter':
    default:
      return { minDist: 8.0, idealDist: 16.5, maxDist: 28.0, speedMul: 1.0 };
  }
}

/** Check if ray `(origin, dir)` hits the player cylinder/box within `maxDist`. */
function rayHitsPlayer(origin: Vec3, dir: Vec3, maxDist: number, playerFeet: Vec3): number | null {
  const r = PLAYER_TUNING.radius + 0.04;
  const playerBox: Box = {
    min: { x: playerFeet.x - r, y: playerFeet.y, z: playerFeet.z - r },
    max: { x: playerFeet.x + r, y: playerFeet.y + PLAYER_TUNING.height, z: playerFeet.z + r },
  };
  const hit = raycast(origin, dir, maxDist, [playerBox]);
  return hit ? hit.distance : null;
}

/**
 * Step all enemy combatants deterministically for one fixed `dt` tick.
 */
export function stepEnemies(
  enemies: readonly EnemyState[],
  ctx: EnemiesStepContext,
): { readonly enemies: EnemyState[]; readonly shots: EnemyShotResult[] } {
  const { map, playerFeet, playerEye, playerAlive, tuning, dt, rng } = ctx;
  const shots: EnemyShotResult[] = [];
  const nextEnemies: EnemyState[] = [];

  for (let idx = 0; idx < enemies.length; idx++) {
    const enemy = enemies[idx];
    if (!enemy) continue;

    if (!enemy.alive) {
      nextEnemies.push({
        ...enemy,
        hitReact: Math.max(0, enemy.hitReact - dt * 5),
        muzzleFlash: 0,
        deathProgress: Math.min(1, enemy.deathProgress + dt * 3.6),
      });
      continue;
    }

    const spec = getWeaponSpec(enemy.weaponId);
    const pref = archetypePreferredRange(enemy.archetype);

    const hitReact = Math.max(0, enemy.hitReact - dt * 6.5);
    let muzzleFlash = Math.max(0, enemy.muzzleFlash - dt * 16);
    let fireCooldown = Math.max(0, enemy.fireCooldown - dt);
    let burstPauseRemaining = Math.max(0, enemy.burstPauseRemaining - dt);
    let coverCooldown = Math.max(0, enemy.coverCooldown - dt);
    let rounds = enemy.rounds;
    let reloadRemaining = enemy.reloadRemaining;
    let burstRemaining = enemy.burstRemaining;

    if (reloadRemaining > 0) {
      reloadRemaining = Math.max(0, reloadRemaining - dt);
      if (reloadRemaining === 0) {
        rounds = spec.magazineSize;
      }
    } else if (rounds === 0) {
      reloadRemaining = spec.reloadTime;
      burstRemaining = 0;
    }

    // 1. Perception & target memory
    const seesPlayer = canEnemyPerceivePlayer(enemy, playerEye, playerAlive, map, tuning);
    let lastKnownPlayerPos = enemy.lastKnownPlayerPos;
    let memoryRemaining = Math.max(0, enemy.memoryRemaining - dt);
    let reactionRemaining = enemy.reactionRemaining;
    let aiState: EnemyAiState = enemy.aiState;
    let exposureTimer = enemy.exposureTimer;

    if (seesPlayer) {
      if (!enemy.canSeePlayer && (enemy.aiState === 'patrol' || enemy.aiState === 'investigate')) {
        reactionRemaining = tuning.reactionTime;
      } else {
        reactionRemaining = Math.max(0, reactionRemaining - dt);
      }
      lastKnownPlayerPos = playerFeet;
      memoryRemaining = tuning.memoryDuration;
      exposureTimer += dt;

      // Decide if enemy should duck/rotate to cover (low ammo reload, prolonged open trade, or hurt).
      const wantsCover =
        coverCooldown === 0 &&
        ((reloadRemaining > 0.4 && enemy.archetype !== 'breacher') ||
          exposureTimer > 2.8 ||
          (enemy.health < enemy.maxHealth * 0.5 && exposureTimer > 0.9));

      if (wantsCover && aiState !== 'cover') {
        aiState = 'cover';
        coverCooldown = 4.2;
        exposureTimer = 0;
      } else if (aiState !== 'cover') {
        aiState = 'engage';
      }
    } else {
      exposureTimer = Math.max(0, exposureTimer - dt * 1.5);
      reactionRemaining = Math.min(tuning.reactionTime, reactionRemaining + dt * 0.8);
      if (memoryRemaining > 0 && lastKnownPlayerPos) {
        if (aiState !== 'cover') {
          aiState = 'investigate';
        }
      } else {
        lastKnownPlayerPos = null;
        aiState = 'patrol';
      }
    }

    // 2. Navigation & Movement intent
    let patrolIndex = enemy.patrolIndex;
    let path = enemy.path;
    let pathGoal = enemy.pathGoal;
    let crouched = false;
    let strafeSign = enemy.strafeSign;
    let strafeTimer = enemy.strafeTimer - dt;
    if (strafeTimer <= 0) {
      strafeSign = rng.next() < 0.5 ? -1 : 1;
      strafeTimer = rng.range(1.1, 2.2);
    }

    let desiredMoveDir = vec3(0, 0, 0);
    let moveSpeed = tuning.moveSpeed * pref.speedMul;

    const replanToward = (goal: Vec3) => {
      const distGoalChanged =
        !pathGoal || Math.hypot(goal.x - pathGoal.x, goal.z - pathGoal.z) > 1.25;
      if (distGoalChanged || path.length === 0) {
        path = findPath(map, enemy.position, goal);
        pathGoal = goal;
      }
    };

    if (aiState === 'patrol') {
      moveSpeed *= 0.62;
      const waypoint = enemy.patrol[patrolIndex % Math.max(1, enemy.patrol.length)];
      if (waypoint) {
        const d = Math.hypot(waypoint.x - enemy.position.x, waypoint.z - enemy.position.z);
        if (d < 0.85) {
          patrolIndex = (patrolIndex + 1) % enemy.patrol.length;
          path = [];
          pathGoal = null;
        } else {
          replanToward(waypoint);
        }
      }
    } else if (aiState === 'cover' && lastKnownPlayerPos) {
      const threatEye = vec3(
        lastKnownPlayerPos.x,
        lastKnownPlayerPos.y + PLAYER_TUNING.eyeHeight,
        lastKnownPlayerPos.z,
      );
      if (!pathGoal || coverCooldown > 4.15) {
        const coverPt = findCoverPosition(map, enemy.position, threatEye, 9.5);
        if (coverPt) {
          path = findPath(map, enemy.position, coverPt);
          pathGoal = coverPt;
        } else {
          aiState = seesPlayer ? 'engage' : 'investigate';
        }
      }
      if (pathGoal && aiState === 'cover') {
        const d = Math.hypot(pathGoal.x - enemy.position.x, pathGoal.z - enemy.position.z);
        if (d < 0.75) {
          path = [];
          // Tuck behind low cover briefly while reloading or recovering composure.
          crouched = !seesPlayer || reloadRemaining > 0;
          if (reloadRemaining === 0 && coverCooldown < 2.2) {
            aiState = seesPlayer ? 'engage' : 'investigate';
            pathGoal = null;
          }
        }
      }
    } else if (aiState === 'engage' && lastKnownPlayerPos) {
      const dx = lastKnownPlayerPos.x - enemy.position.x;
      const dz = lastKnownPlayerPos.z - enemy.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > pref.maxDist) {
        // Advance along path to enter effective weapon range.
        replanToward(lastKnownPlayerPos);
      } else {
        path = [];
        pathGoal = null;
        // Tactical strafe + range spacing so combatant feels alive without erratic jitter.
        const inv = 1 / Math.max(1e-4, dist);
        const toPlayerX = dx * inv;
        const toPlayerZ = dz * inv;
        const rightX = -toPlayerZ * strafeSign;
        const rightZ = toPlayerX * strafeSign;
        let radial = 0;
        if (dist < pref.minDist) radial = -0.75;
        else if (dist > pref.idealDist + 3.5 && enemy.archetype === 'breacher') radial = 0.7;

        const mx = rightX * 0.72 + toPlayerX * radial;
        const mz = rightZ * 0.72 + toPlayerZ * radial;
        const mLen = Math.hypot(mx, mz);
        if (mLen > 1e-4) {
          desiredMoveDir = vec3(mx / mLen, 0, mz / mLen);
        }
        moveSpeed *= enemy.archetype === 'marksman' ? 0.55 : 0.78;
        if (enemy.archetype === 'marksman' && dist > 18 && reloadRemaining === 0) {
          crouched = false;
        }
      }
    } else if (aiState === 'investigate' && lastKnownPlayerPos) {
      const dist = Math.hypot(
        lastKnownPlayerPos.x - enemy.position.x,
        lastKnownPlayerPos.z - enemy.position.z,
      );
      if (dist < 1.6) {
        // Reached last known spot and player isn't here; transition back to patrol once memory ebbs.
        path = [];
        pathGoal = null;
        memoryRemaining = Math.min(memoryRemaining, 1.2);
      } else {
        moveSpeed *= 0.85;
        replanToward(lastKnownPlayerPos);
      }
    }

    // Follow `path` waypoints if active.
    if (path.length > 0) {
      let wp = path[0];
      while (wp && Math.hypot(wp.x - enemy.position.x, wp.z - enemy.position.z) < 0.52) {
        path = path.slice(1);
        wp = path[0];
      }
      if (wp) {
        const dx = wp.x - enemy.position.x;
        const dz = wp.z - enemy.position.z;
        const len = Math.hypot(dx, dz);
        if (len > 1e-4) {
          desiredMoveDir = vec3(dx / len, 0, dz / len);
        }
      }
    }

    // Soft pairwise separation from other live enemies so squads never stack inside one spot.
    let sepX = 0;
    let sepZ = 0;
    for (let j = 0; j < enemies.length; j++) {
      if (j === idx) continue;
      const other = j < nextEnemies.length ? nextEnemies[j] : enemies[j];
      if (!other || !other.alive) continue;
      const ox = enemy.position.x - other.position.x;
      const oz = enemy.position.z - other.position.z;
      const d = Math.hypot(ox, oz);
      const minDist = 0.92;
      if (d > 1e-4 && d < minDist) {
        const push = (minDist - d) / minDist;
        sepX += (ox / d) * push * 1.35;
        sepZ += (oz / d) * push * 1.35;
      }
    }

    let vx = desiredMoveDir.x * moveSpeed + sepX;
    let vz = desiredMoveDir.z * moveSpeed + sepZ;
    const vMag = Math.hypot(vx, vz);
    const maxSpd = tuning.moveSpeed * 1.15;
    if (vMag > maxSpd) {
      vx = (vx / vMag) * maxSpd;
      vz = (vz / vMag) * maxSpd;
    }

    const bodyH = crouched ? ENEMY_BODY.crouchedHeight : ENEMY_BODY.standingHeight;
    const moved = moveBody(
      enemy.position,
      vec3(vx * dt, 0, vz * dt),
      ENEMY_BODY.radius,
      bodyH,
      map.solids,
    );
    const nextPos = moved.position;
    const actualVel = vec3(
      (nextPos.x - enemy.position.x) / dt,
      0,
      (nextPos.z - enemy.position.z) / dt,
    );
    const actualSpeed = Math.hypot(actualVel.x, actualVel.z);

    // Stuck recovery: if trying to move along a path or strafe and making near-zero progress, replan/flip.
    let progressAnchor = enemy.progressAnchor;
    let stuckTimer = enemy.stuckTimer;
    const wantedToMove = Math.hypot(desiredMoveDir.x, desiredMoveDir.z) > 0.25;
    if (wantedToMove) {
      stuckTimer += dt;
      if (stuckTimer >= 0.55) {
        const progressed = Math.hypot(nextPos.x - progressAnchor.x, nextPos.z - progressAnchor.z);
        if (progressed < 0.14) {
          strafeSign = strafeSign === 1 ? -1 : 1;
          if (pathGoal) {
            path = findPath(map, nextPos, pathGoal);
          }
          if (aiState === 'patrol' && enemy.patrol.length > 1) {
            patrolIndex = (patrolIndex + 1) % enemy.patrol.length;
            path = [];
            pathGoal = null;
          }
        }
        progressAnchor = nextPos;
        stuckTimer = 0;
      }
    } else {
      progressAnchor = nextPos;
      stuckTimer = 0;
    }

    // 3. Finite-speed aiming & rotation
    const eyeAfterMove = vec3(
      nextPos.x,
      nextPos.y + (crouched ? ENEMY_BODY.eyeHeightCrouched : ENEMY_BODY.eyeHeightStanding),
      nextPos.z,
    );
    let targetLookPoint: Vec3 | null = null;
    if (seesPlayer) {
      // Aim toward player upper torso / chest center rather than raw feet.
      targetLookPoint = vec3(playerEye.x, playerFeet.y + 1.28, playerEye.z);
    } else if (lastKnownPlayerPos) {
      targetLookPoint = vec3(
        lastKnownPlayerPos.x,
        lastKnownPlayerPos.y + 1.35,
        lastKnownPlayerPos.z,
      );
    } else if (actualSpeed > 0.25) {
      targetLookPoint = vec3(nextPos.x + actualVel.x, eyeAfterMove.y, nextPos.z + actualVel.z);
    }

    let yaw = enemy.yaw;
    let pitch = enemy.pitch;
    let aimError = Math.PI;

    if (targetLookPoint) {
      const desired = desiredAnglesToward(eyeAfterMove, targetLookPoint);
      const maxTurn = tuning.turnSpeed * dt;
      const dyaw = angleDelta(yaw, desired.yaw);
      const dpitch = desired.pitch - pitch;
      yaw += clamp(dyaw, -maxTurn, maxTurn);
      pitch = clamp(pitch + clamp(dpitch, -maxTurn, maxTurn), -1.1, 1.1);
      aimError = Math.hypot(angleDelta(yaw, desired.yaw), desired.pitch - pitch);
    } else {
      pitch += clamp(-pitch, -tuning.turnSpeed * dt, tuning.turnSpeed * dt);
    }

    // 4. Legal weapon burst firing
    const canFireNow =
      seesPlayer &&
      playerAlive &&
      !crouched &&
      reactionRemaining === 0 &&
      reloadRemaining === 0 &&
      fireCooldown === 0 &&
      rounds > 0 &&
      aimError < 0.26;

    if (canFireNow) {
      if (burstRemaining === 0 && burstPauseRemaining === 0) {
        burstRemaining =
          spec.fireMode === 'pump' || spec.fireMode === 'bolt'
            ? 1
            : rng.int(tuning.burstMin, tuning.burstMax);
      }

      if (burstRemaining > 0) {
        rounds -= 1;
        burstRemaining -= 1;
        fireCooldown = Math.max(spec.fireInterval * 1.35, 0.11);
        muzzleFlash = 1;

        if (burstRemaining === 0) {
          burstPauseRemaining = rng.range(tuning.burstCooldownMin, tuning.burstCooldownMax);
        }

        const muzzle = enemyMuzzlePos({
          ...enemy,
          position: nextPos,
          yaw,
          pitch,
          crouched,
        });
        const moveSpreadMul = actualSpeed > 0.6 ? tuning.movingSpreadFactor : 1.0;
        const baseSpread =
          tuning.aimSpreadRad * moveSpreadMul + (spec.pellets > 1 ? spec.pelletSpread * 0.85 : 0);

        const pelletCount = spec.pellets;
        for (let p = 0; p < pelletCount; p++) {
          const jitterYaw = rng.signed() * baseSpread;
          const jitterPitch = rng.signed() * baseSpread * 0.78;
          const dir = forwardFromAngles(yaw + jitterYaw, pitch + jitterPitch);

          const wallHit = raycast(muzzle, dir, spec.range, map.solids);
          const wallDist = wallHit ? wallHit.distance : spec.range;
          const playerHitDist = rayHitsPlayer(muzzle, dir, wallDist, playerFeet);

          if (playerHitDist !== null) {
            const rawDmg = weaponProjectileDamage(spec, playerHitDist, 'torso');
            const scaledDmg = Math.max(1, Math.round(rawDmg * tuning.enemyDamageScale));
            shots.push({
              enemyId: enemy.id,
              weaponId: enemy.weaponId,
              origin: muzzle,
              direction: dir,
              endPoint: add(muzzle, scale(dir, playerHitDist)),
              hitPlayer: true,
              damageToPlayer: scaledDmg,
              surfaceHitNormal: null,
            });
          } else {
            shots.push({
              enemyId: enemy.id,
              weaponId: enemy.weaponId,
              origin: muzzle,
              direction: dir,
              endPoint: add(muzzle, scale(dir, wallDist)),
              hitPlayer: false,
              damageToPlayer: 0,
              surfaceHitNormal: wallHit ? wallHit.normal : null,
            });
          }
        }
      }
    }

    const walkPhase = (enemy.walkPhase + actualSpeed * dt * 3.1) % (Math.PI * 2);

    nextEnemies.push({
      ...enemy,
      position: nextPos,
      velocity: actualVel,
      yaw,
      pitch,
      crouched,
      aiState,
      patrolIndex,
      path,
      pathGoal,
      lastKnownPlayerPos,
      memoryRemaining,
      canSeePlayer: seesPlayer,
      reactionRemaining,
      rounds,
      fireCooldown,
      reloadRemaining,
      burstRemaining,
      burstPauseRemaining,
      exposureTimer,
      coverCooldown,
      strafeSign,
      strafeTimer,
      progressAnchor,
      stuckTimer,
      hitReact,
      muzzleFlash,
      walkPhase,
    });
  }

  return { enemies: nextEnemies, shots };
}
