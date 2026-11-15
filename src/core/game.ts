import type { Box } from './collision';
import { bodyBox, raycast } from './collision';
import type { EnemyState, HitZone } from './enemy';
import {
  alertEnemiesByGunshot,
  createEnemy,
  damageEnemy,
  ENEMY_BODY,
  raycastEnemies,
  stepEnemies,
} from './enemy';
import type { GameMap, MapId, SurfaceMaterial, TargetSpawn } from './map';
import type { GameModeId } from './modes';
import { DEFAULT_GAME_MODE, getGameModeSpec, GUN_GAME_LADDER } from './modes';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, eyePosition, stepPlayer } from './player';
import { createSeededRng, normalizeSeed } from './rng';
import type { Vec3 } from './vec';
import { add, scale, vec3 } from './vec';
import type {
  EffectiveWeaponSpec,
  Loadout,
  WeaponId,
  WeaponInput,
  WeaponSlot,
  WeaponState,
} from './weapon';
import {
  createWeapon,
  DEFAULT_LOADOUT,
  effectiveWeaponSpec,
  equipLoadout,
  equipSingleWeapon,
  getWeaponSpec,
  pelletDirections,
  resolveWeaponOptic,
  stepWeapon,
  weaponProjectileDamage,
} from './weapon';

export type GameInput = PlayerInput & WeaponInput;
export type MatchOutcome = 'ongoing' | 'victory' | 'defeat';

export interface RunStats {
  /** Seconds elapsed in the current run; freezes once outcome resolves or all targets fall. */
  readonly elapsed: number;
  /** True once the player acts in the current run and until resolution. */
  readonly active: boolean;
  /** Shots fired in the current run. */
  readonly shotsFired: number;
  /** Shots that hit a standing target or live enemy in the current run. */
  readonly targetHits: number;
  /** Confirmed enemy neutralizations in combat modes. */
  readonly enemiesDown: number;
  /** Headshot neutralizations in combat modes. */
  readonly headshots: number;
  /** Cumulative HP lost by the player in the current run. */
  readonly damageTaken: number;
}

export interface GameState {
  readonly mode: GameModeId;
  readonly mapId: MapId;
  readonly outcome: MatchOutcome;
  /** 0-based index into `GUN_GAME_LADDER` (`0..7` in `'gungame'`; `0` in `'practice'`). */
  readonly gunGameTier: number;
  readonly player: PlayerState;
  readonly playerHealth: number;
  readonly playerMaxHealth: number;
  /** Unit horizontal vector pointing FROM player TOWARD last attacker (`null` until hit). */
  readonly lastDamageDir: Vec3 | null;
  /** Normalized `0..1` incoming damage flinch/vignette pulse that decays cleanly. */
  readonly damagePulse: number;
  readonly weapon: WeaponState;
  /** Active AI combatants in `'gungame'` (`[]` in `'practice'`). */
  readonly enemies: readonly EnemyState[];
  /** True for each steel target knocked down (`[]` when `mode !== 'practice'`). */
  readonly targetsDown: readonly boolean[];
  /** Seconds until steel targets stand back up in `'practice'` mode; 0 otherwise. */
  readonly resetIn: number;
  /** Telemetry for the current run. */
  readonly run: RunStats;
  /** Deterministic PRNG 32-bit state carried purely across ticks. */
  readonly rngState: number;
}

export interface ShotImpact {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly surface: SurfaceMaterial | 'target' | 'enemy';
  readonly hitZone?: HitZone;
}

export type GameEvent =
  | {
      readonly type: 'shot';
      readonly weaponId: WeaponId;
      readonly origin: Vec3;
      readonly direction: Vec3;
      /** Primary impact (first ray or first pellet that connected). */
      readonly hit: ShotImpact | null;
      /** Every projectile impact for this shot (1 for rifles/pistols, up to 8 for buckshot). */
      readonly hits: readonly ShotImpact[];
    }
  | {
      readonly type: 'enemy-shot';
      readonly enemyId: string;
      readonly weaponId: WeaponId;
      readonly origin: Vec3;
      readonly direction: Vec3;
      readonly endPoint: Vec3;
      readonly hitPlayer: boolean;
      readonly surfaceHitNormal: Vec3 | null;
    }
  | {
      readonly type: 'enemy-hit';
      readonly enemyId: string;
      readonly point: Vec3;
      readonly zone: HitZone;
      readonly damage: number;
      readonly killed: boolean;
      readonly distance: number;
    }
  | {
      readonly type: 'enemy-down';
      readonly enemyId: string;
      readonly headshot: boolean;
      readonly distance: number;
      readonly remaining: number;
    }
  | {
      readonly type: 'gun-game-advance';
      readonly tierIndex: number;
      readonly totalTiers: number;
      readonly weaponId: WeaponId;
    }
  | {
      readonly type: 'player-hit';
      readonly damage: number;
      readonly healthRemaining: number;
      readonly fromDirection: Vec3;
    }
  | { readonly type: 'player-down' }
  | { readonly type: 'mode-victory'; readonly mode: GameModeId }
  | { readonly type: 'target-down'; readonly index: number; readonly distance: number }
  | { readonly type: 'targets-reset' }
  | { readonly type: 'weapon-switch'; readonly weaponId: WeaponId; readonly slot: WeaponSlot }
  | { readonly type: 'zoom-toggle'; readonly zoom: number }
  | { readonly type: 'dry-fire' | 'reload-start' | 'reload-end' | 'jump' }
  | { readonly type: 'land'; readonly speed: number };

export const TARGET = {
  /** Steel plate: a rectangular body with a narrower head on top. */
  bodyWidth: 0.45,
  bodyBottom: 0.75,
  bodyTop: 1.5,
  headWidth: 0.24,
  headTop: 1.74,
  thickness: 0.02,
  /** Depth of the stand the player collides with. */
  standDepth: 0.3,
  resetDelay: 3,
} as const;

function slab(spawn: TargetSpawn, width: number, depth: number, bottom: number, top: number): Box {
  const { x, z } = spawn.position;
  const halfX = spawn.facing.x !== 0 ? depth / 2 : width / 2;
  const halfZ = spawn.facing.z !== 0 ? depth / 2 : width / 2;
  return {
    min: { x: x - halfX, y: bottom, z: z - halfZ },
    max: { x: x + halfX, y: top, z: z + halfZ },
  };
}

/** The parts of a standing target a bullet can hit. */
export function targetHitBoxes(spawn: TargetSpawn): [Box, Box] {
  return [
    slab(spawn, TARGET.bodyWidth, TARGET.thickness, TARGET.bodyBottom, TARGET.bodyTop),
    slab(spawn, TARGET.headWidth, TARGET.thickness, TARGET.bodyTop, TARGET.headTop),
  ];
}

/** Point a shooter should aim at on a steel target. */
export function targetCentre(spawn: TargetSpawn): Vec3 {
  return { x: spawn.position.x, y: (TARGET.bodyBottom + TARGET.bodyTop) / 2, z: spawn.position.z };
}

function targetBlocker(spawn: TargetSpawn): Box {
  return slab(spawn, TARGET.bodyWidth, TARGET.standDepth, 0, TARGET.headTop);
}

function enemyBlocker(enemy: EnemyState): Box {
  const h = enemy.crouched ? ENEMY_BODY.crouchedHeight : ENEMY_BODY.standingHeight;
  return bodyBox(enemy.position, ENEMY_BODY.radius, h);
}

export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: -Math.cos(yaw) * cosPitch };
}

export function activeWeaponSpec(state: GameState): EffectiveWeaponSpec {
  return effectiveWeaponSpec(
    state.weapon.weaponId,
    resolveWeaponOptic(state.weapon.loadout, state.weapon.weaponId),
  );
}

export const INITIAL_RUN_STATS: RunStats = {
  elapsed: 0,
  active: false,
  shotsFired: 0,
  targetHits: 0,
  enemiesDown: 0,
  headshots: 0,
  damageTaken: 0,
};

/** Accuracy percentage (0..100) for a run, or 0 before firing. */
export function runAccuracyPercent(run: RunStats): number {
  if (run.shotsFired === 0) return 0;
  return Math.min(100, Math.round((run.targetHits / run.shotsFired) * 100));
}

function hasRunAction(input: GameInput): boolean {
  return (
    input.forward !== 0 ||
    input.right !== 0 ||
    input.jump ||
    input.sprint ||
    input.lean !== 0 ||
    input.fire ||
    input.aim ||
    input.reload ||
    Boolean(input.switchSlot)
  );
}

export interface CreateGameOptions {
  readonly mode?: GameModeId;
  readonly seed?: number;
}

export function createGame(
  map: GameMap,
  loadout: Loadout = DEFAULT_LOADOUT,
  activeSlot: WeaponSlot = 'primary',
  options: CreateGameOptions = {},
): GameState {
  const mode = options.mode ?? DEFAULT_GAME_MODE;
  const modeSpec = getGameModeSpec(mode);
  const seed = normalizeSeed(options.seed ?? 0x20261114);

  const spawnedEnemies = modeSpec.usesEnemies
    ? map.enemies.slice(0, modeSpec.enemyLimit).map(createEnemy)
    : [];

  const spawnedTargets = modeSpec.usesEnemies ? [] : map.targets.map(() => false);

  let initialWeapon: WeaponState;
  if (modeSpec.usesWeaponLadder) {
    const startId = GUN_GAME_LADDER[0] ?? 'm1911';
    const startSlot = getWeaponSpec(startId).slot;
    const ladderLoadout: Loadout =
      startSlot === 'primary'
        ? { ...loadout, primary: startId }
        : { ...loadout, secondary: startId };
    initialWeapon = createWeapon(ladderLoadout, startSlot);
  } else {
    initialWeapon = createWeapon(loadout, activeSlot);
  }

  return {
    mode,
    mapId: map.id,
    outcome: 'ongoing',
    gunGameTier: 0,
    player: createPlayer(map.spawn.position, map.spawn.yaw),
    playerHealth: modeSpec.playerMaxHealth,
    playerMaxHealth: modeSpec.playerMaxHealth,
    lastDamageDir: null,
    damagePulse: 0,
    weapon: initialWeapon,
    enemies: spawnedEnemies,
    targetsDown: spawnedTargets,
    resetIn: 0,
    run: INITIAL_RUN_STATS,
    rngState: seed,
  };
}

/**
 * Update the player's carried loadout without disturbing their position or run.
 * In Gun Game, optical sight preferences sync immediately while the active tier firearm stays locked
 * to `GUN_GAME_LADDER[state.gunGameTier]`.
 */
export function setGameLoadout(
  state: GameState,
  loadout: Loadout,
  activeSlot: WeaponSlot = state.weapon.activeSlot,
): GameState {
  const modeSpec = getGameModeSpec(state.mode);
  if (modeSpec.usesWeaponLadder) {
    const lockedWeaponId = GUN_GAME_LADDER[state.gunGameTier] ?? state.weapon.weaponId;
    const lockedSlot = getWeaponSpec(lockedWeaponId).slot;
    const mergedLoadout: Loadout =
      lockedSlot === 'primary'
        ? { ...loadout, primary: lockedWeaponId }
        : { ...loadout, secondary: lockedWeaponId };
    return {
      ...state,
      weapon: {
        ...state.weapon,
        loadout: mergedLoadout,
      },
    };
  }
  return {
    ...state,
    weapon: equipLoadout(state.weapon, loadout, activeSlot),
  };
}

export function stepGame(
  state: GameState,
  input: GameInput,
  dt: number,
  map: GameMap,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const modeSpec = getGameModeSpec(state.mode);
  const rng = createSeededRng(state.rngState);

  let outcome = state.outcome;
  let gunGameTier = state.gunGameTier;
  let playerHealth = state.playerHealth;
  let lastDamageDir = state.lastDamageDir;
  let damagePulse = Math.max(0, state.damagePulse - dt * 2.4);
  let enemies: EnemyState[] = [...state.enemies];
  let targetsDown = state.targetsDown;
  let resetIn = state.resetIn;
  let { elapsed, active, shotsFired, targetHits, enemiesDown, headshots, damageTaken } = state.run;

  // Practice mode target auto-reset countdown.
  if (!modeSpec.usesEnemies && resetIn > 0) {
    resetIn = Math.max(0, resetIn - dt);
    if (resetIn === 0) {
      targetsDown = targetsDown.map(() => false);
      elapsed = 0;
      active = false;
      shotsFired = 0;
      targetHits = 0;
      events.push({ type: 'targets-reset' });
    }
  }

  // If the player is defeated, freeze movement/weapon fire and let death animations settle cleanly.
  if (outcome === 'defeat') {
    const deadEnemyStep = stepEnemies(enemies, {
      map,
      playerFeet: state.player.position,
      playerEye: eyePosition(state.player),
      playerAlive: false,
      tuning: modeSpec.tuning,
      dt,
      rng,
    });
    return {
      state: {
        ...state,
        damagePulse,
        enemies: deadEnemyStep.enemies,
        rngState: rng.getState(),
      },
      events,
    };
  }

  const practiceFinishedBeforeStep =
    !modeSpec.usesEnemies &&
    (resetIn > 0 || (targetsDown.length > 0 && targetsDown.every(Boolean)));
  const resolvedBeforeStep = outcome !== 'ongoing' || practiceFinishedBeforeStep;

  // In Gun Game, manual slot switching (`1`/`2`) is disabled because kills govern weapon tier progression.
  const effectiveInput: GameInput = modeSpec.usesWeaponLadder
    ? { ...input, switchSlot: null }
    : input;

  if (!resolvedBeforeStep && !active && hasRunAction(effectiveInput)) {
    active = true;
  }

  // Build movement blockers: map solids + standing targets (in practice mode) + LIVE enemies (corpses never block!).
  const standingTargets = modeSpec.usesEnemies
    ? []
    : map.targets.filter((_, index) => !targetsDown[index]);
  const liveEnemyBlockers = enemies.filter((e) => e.alive).map(enemyBlocker);
  const solids: Box[] = [
    ...map.solids,
    ...standingTargets.map(targetBlocker),
    ...liveEnemyBlockers,
  ];

  const playerStep = stepPlayer(state.player, effectiveInput, dt, solids);
  const player = playerStep.state;
  if (playerStep.jumped) events.push({ type: 'jump' });
  if (playerStep.landedSpeed !== null) events.push({ type: 'land', speed: playerStep.landedSpeed });

  const weaponStep = stepWeapon(state.weapon, effectiveInput, dt);
  let nextWeaponState = weaponStep.state;
  const spec = effectiveWeaponSpec(
    nextWeaponState.weaponId,
    resolveWeaponOptic(nextWeaponState.loadout, nextWeaponState.weaponId),
  );
  let resolvedThisStep = false;

  for (const event of weaponStep.events) {
    if (event === 'weapon-switch') {
      events.push({
        type: 'weapon-switch',
        weaponId: nextWeaponState.weaponId,
        slot: nextWeaponState.activeSlot,
      });
      continue;
    }
    if (event === 'zoom-toggle') {
      const nextZoom =
        spec.zoomStages.length === 2 && nextWeaponState.zoomStage === 1
          ? spec.zoomStages[1]
          : spec.zoomStages[0];
      events.push({ type: 'zoom-toggle', zoom: nextZoom });
      continue;
    }
    if (event !== 'shot') {
      events.push({ type: event });
      continue;
    }

    if (!resolvedBeforeStep && !resolvedThisStep) {
      shotsFired++;
    }

    const origin = eyePosition(player);
    const shotPitch = player.pitch + state.weapon.recoil;
    const baseDirection = aimDirection(player.yaw, shotPitch);
    const directions = pelletDirections(
      player.yaw,
      shotPitch,
      spec,
      state.weapon.aim,
      nextWeaponState.shotSequence,
    );

    if (modeSpec.usesEnemies) {
      // Alert nearby combatants to unsuppressed gunfire.
      enemies = alertEnemiesByGunshot(enemies, player.position, modeSpec.tuning);

      const hits: ShotImpact[] = [];
      let connectedEnemyThisTriggerPull = false;

      // Accumulate damage per enemy across multi-pellet buckshot or single rifle projectile.
      const pendingDamage = new Map<
        number,
        { damage: number; bestZone: HitZone; point: Vec3; distance: number }
      >();

      for (const direction of directions) {
        const wallHit = raycast(origin, direction, spec.range, map.solids);
        const maxDist = wallHit ? wallHit.distance : spec.range;
        const enemyHit = raycastEnemies(origin, direction, maxDist, enemies);

        if (enemyHit) {
          connectedEnemyThisTriggerPull = true;
          const dmg = weaponProjectileDamage(spec, enemyHit.distance, enemyHit.zone);
          hits.push({
            point: enemyHit.point,
            normal: enemyHit.normal,
            distance: enemyHit.distance,
            surface: 'enemy',
            hitZone: enemyHit.zone,
          });
          const prev = pendingDamage.get(enemyHit.enemyIndex);
          if (!prev) {
            pendingDamage.set(enemyHit.enemyIndex, {
              damage: dmg,
              bestZone: enemyHit.zone,
              point: enemyHit.point,
              distance: enemyHit.distance,
            });
          } else {
            pendingDamage.set(enemyHit.enemyIndex, {
              damage: prev.damage + dmg,
              bestZone:
                prev.bestZone === 'head' || enemyHit.zone === 'head' ? 'head' : prev.bestZone,
              point: prev.point,
              distance: Math.min(prev.distance, enemyHit.distance),
            });
          }
        } else if (wallHit) {
          const mapSolid = map.solids[wallHit.index];
          if (mapSolid) {
            hits.push({
              point: add(origin, scale(direction, wallHit.distance)),
              normal: wallHit.normal,
              distance: wallHit.distance,
              surface: mapSolid.material,
            });
          }
        }
      }

      events.push({
        type: 'shot',
        weaponId: nextWeaponState.weaponId,
        origin,
        direction: baseDirection,
        hit: hits[0] ?? null,
        hits,
      });

      if (connectedEnemyThisTriggerPull && !resolvedBeforeStep && !resolvedThisStep) {
        targetHits++;
      }

      for (const [enemyIdx, info] of pendingDamage) {
        const targetEnemy = enemies[enemyIdx];
        if (!targetEnemy) continue;
        const applied = damageEnemy(targetEnemy, info.damage, player.position, modeSpec.tuning);
        enemies[enemyIdx] = applied.enemy;
        events.push({
          type: 'enemy-hit',
          enemyId: targetEnemy.id,
          point: info.point,
          zone: info.bestZone,
          damage: Math.round(info.damage),
          killed: applied.killed,
          distance: info.distance,
        });

        if (applied.killed) {
          enemiesDown++;
          const wasHeadshot = info.bestZone === 'head';
          if (wasHeadshot) headshots++;
          const remaining = enemies.filter((e) => e.alive).length;
          events.push({
            type: 'enemy-down',
            enemyId: targetEnemy.id,
            headshot: wasHeadshot,
            distance: info.distance,
            remaining,
          });

          if (modeSpec.usesWeaponLadder && outcome === 'ongoing') {
            if (gunGameTier + 1 >= GUN_GAME_LADDER.length) {
              // Final weapon tier cleared — Gun Game Victory!
              outcome = 'victory';
              active = false;
              resolvedThisStep = true;
              events.push({ type: 'mode-victory', mode: state.mode });
            } else {
              gunGameTier += 1;
              const promotedId = GUN_GAME_LADDER[gunGameTier] ?? nextWeaponState.weaponId;
              nextWeaponState = equipSingleWeapon(nextWeaponState, promotedId);
              events.push({
                type: 'gun-game-advance',
                tierIndex: gunGameTier,
                totalTiers: GUN_GAME_LADDER.length,
                weaponId: promotedId,
              });
              events.push({
                type: 'weapon-switch',
                weaponId: promotedId,
                slot: nextWeaponState.activeSlot,
              });
            }
          } else if (remaining === 0 && outcome === 'ongoing') {
            outcome = 'victory';
            active = false;
            resolvedThisStep = true;
            events.push({ type: 'mode-victory', mode: state.mode });
          }
        }
      }
    } else {
      // Dedicated Practice mode (reactive AR500 steel silhouettes).
      const targetIndexes = map.targets.flatMap((_, index) =>
        targetsDown[index] ? [] : [index, index],
      );
      const targetBoxes = map.targets.flatMap((spawn, index) =>
        targetsDown[index] ? [] : targetHitBoxes(spawn),
      );
      const raySolids: Box[] = [...map.solids, ...targetBoxes];

      const hits: ShotImpact[] = [];
      const knockedThisShot = new Map<number, number>();

      for (const direction of directions) {
        const hit = raycast(origin, direction, spec.range, raySolids);
        if (!hit) continue;
        const mapSolid = map.solids[hit.index];
        const point = add(origin, scale(direction, hit.distance));
        hits.push({
          point,
          normal: hit.normal,
          distance: hit.distance,
          surface: mapSolid ? mapSolid.material : 'target',
        });

        const targetIndex = targetIndexes[hit.index - map.solids.length];
        if (targetIndex !== undefined && !knockedThisShot.has(targetIndex)) {
          knockedThisShot.set(targetIndex, hit.distance);
        }
      }

      events.push({
        type: 'shot',
        weaponId: nextWeaponState.weaponId,
        origin,
        direction: baseDirection,
        hit: hits[0] ?? null,
        hits,
      });

      if (knockedThisShot.size > 0) {
        if (!resolvedBeforeStep && !resolvedThisStep) {
          targetHits++;
        }
        targetsDown = targetsDown.map((down, index) => down || knockedThisShot.has(index));
        for (const [targetIndex, distance] of knockedThisShot) {
          events.push({ type: 'target-down', index: targetIndex, distance });
        }
        if (targetsDown.every(Boolean)) {
          resetIn = TARGET.resetDelay;
          active = false;
          resolvedThisStep = true;
        }
      }
    }
  }

  // Step AI enemies in combat modes.
  if (modeSpec.usesEnemies && enemies.length > 0) {
    const enemyStep = stepEnemies(enemies, {
      map,
      playerFeet: player.position,
      playerEye: eyePosition(player),
      playerAlive: outcome === 'ongoing',
      tuning: modeSpec.tuning,
      dt,
      rng,
    });
    enemies = enemyStep.enemies;

    for (const eShot of enemyStep.shots) {
      events.push({
        type: 'enemy-shot',
        enemyId: eShot.enemyId,
        weaponId: eShot.weaponId,
        origin: eShot.origin,
        direction: eShot.direction,
        endPoint: eShot.endPoint,
        hitPlayer: eShot.hitPlayer,
        surfaceHitNormal: eShot.surfaceHitNormal,
      });

      if (eShot.hitPlayer && outcome === 'ongoing' && playerHealth > 0) {
        if (!active) active = true;
        const appliedDamage = Math.min(playerHealth, eShot.damageToPlayer);
        playerHealth = Math.max(0, playerHealth - appliedDamage);
        damageTaken += appliedDamage;
        damagePulse = Math.min(1, damagePulse + 0.55);

        const dx = eShot.origin.x - player.position.x;
        const dz = eShot.origin.z - player.position.z;
        const dLen = Math.hypot(dx, dz);
        const dirFrom = dLen > 1e-4 ? vec3(dx / dLen, 0, dz / dLen) : vec3(0, 0, -1);
        lastDamageDir = dirFrom;

        events.push({
          type: 'player-hit',
          damage: appliedDamage,
          healthRemaining: playerHealth,
          fromDirection: dirFrom,
        });

        if (playerHealth === 0) {
          outcome = 'defeat';
          active = false;
          resolvedThisStep = true;
          events.push({ type: 'player-down' });
        }
      }
    }
  }

  if (active && !resolvedBeforeStep && !resolvedThisStep) {
    elapsed += dt;
  }

  const run: RunStats =
    elapsed === state.run.elapsed &&
    active === state.run.active &&
    shotsFired === state.run.shotsFired &&
    targetHits === state.run.targetHits &&
    enemiesDown === state.run.enemiesDown &&
    headshots === state.run.headshots &&
    damageTaken === state.run.damageTaken
      ? state.run
      : { elapsed, active, shotsFired, targetHits, enemiesDown, headshots, damageTaken };

  return {
    state: {
      mode: state.mode,
      mapId: state.mapId,
      outcome,
      gunGameTier,
      player,
      playerHealth,
      playerMaxHealth: state.playerMaxHealth,
      lastDamageDir,
      damagePulse,
      weapon: nextWeaponState,
      enemies,
      targetsDown,
      resetIn,
      run,
      rngState: rng.getState(),
    },
    events,
  };
}
