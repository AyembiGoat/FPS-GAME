import type { Box } from './collision';
import { bodyBox, raycast } from './collision';
import type {
  ConsumableCancelReason,
  ConsumableId,
  ConsumableInventory,
  ConsumableRequest,
  ConsumableUse,
} from './consumables';
import { BOOST_TUNING, sanitizeConsumables, stepSurvival } from './consumables';
import type { ArmourPiece, ArmourState, HitZone, Vitals } from './damage';
import { applyDamage, createArmour } from './damage';
import type { EnemyState } from './enemy';
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
  equipLoadout,
  equipSingleWeapon,
  getWeaponSpec,
  loadoutWeaponSpec,
  pelletDirections,
  stepWeapon,
  weaponProjectileDamage,
} from './weapon';

export type GameInput = PlayerInput &
  WeaponInput & {
    /** One-shot request to use a healing or boost item (a specific one, or the best carried). */
    readonly useConsumable?: ConsumableRequest | null;
  };
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

/** Something the damage model can hurt. */
export type EntityRef =
  | { readonly kind: 'player' }
  | { readonly kind: 'enemy'; readonly id: string }
  | { readonly kind: 'dummy'; readonly index: number };

/** Health and armour of a damageable practice dummy. */
export interface TargetVitals extends Vitals {
  /** Seconds left in which the player may see this dummy's health after hurting it. */
  readonly revealRemaining: number;
}

/** The hurt enemy or dummy under the player's sights, for the aimed health readout. */
export interface AimedTarget {
  readonly entity: EntityRef;
  readonly health: number;
  readonly maxHealth: number;
}

export const TARGET_HEALTH_REVEAL = {
  /** Seconds an enemy's health stays readable after the player last hurt it. Game balance. */
  seconds: 10,
  /** How far the sights must be raised (0..1) before the readout appears. */
  minAim: 0.6,
} as const;

export interface GameState {
  readonly mode: GameModeId;
  readonly mapId: MapId;
  readonly outcome: MatchOutcome;
  /** 0-based index into `GUN_GAME_LADDER` (`0..7` in `'gungame'`; `0` in `'practice'`). */
  readonly gunGameTier: number;
  readonly player: PlayerState;
  readonly playerHealth: number;
  readonly playerMaxHealth: number;
  /** Vest and helmet the player is wearing. */
  readonly playerArmour: ArmourState;
  /** 0..100 boost meter; above 25 it slowly restores health. */
  readonly playerBoost: number;
  /** Carried healing and boost items: five fixed integer counts. */
  readonly consumables: ConsumableInventory;
  /** The item being applied right now, or `null`. The weapon cannot fire while this is set. */
  readonly consumableUse: ConsumableUse | null;
  /** Unit horizontal vector pointing FROM player TOWARD last attacker (`null` until hit). */
  readonly lastDamageDir: Vec3 | null;
  /** Normalized `0..1` incoming damage flinch/vignette pulse that decays cleanly. */
  readonly damagePulse: number;
  readonly weapon: WeaponState;
  /** Active AI combatants in `'gungame'` (`[]` in `'practice'`). */
  readonly enemies: readonly EnemyState[];
  /** True for each steel target knocked down (`[]` when `mode !== 'practice'`). */
  readonly targetsDown: readonly boolean[];
  /** Health and armour per target; `null` for a steel plate that drops to any hit. */
  readonly targetVitals: readonly (TargetVitals | null)[];
  /** Hurt enemy or dummy under the raised sights, or `null`. */
  readonly aimedTarget: AimedTarget | null;
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
      /** Every projectile impact for this shot (1 for rifles/pistols, one per pellet for shot). */
      readonly hits: readonly ShotImpact[];
      /** True when a suppressor is fitted: the report is quieter and duller. */
      readonly suppressed: boolean;
      /** Multiplier on the visible muzzle flash (0 = hidden by a flash hider). */
      readonly muzzleFlash: number;
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
      /** Health lost after armour. */
      readonly damage: number;
      readonly healthRemaining: number;
      readonly fromDirection: Vec3;
      readonly zone: HitZone;
      /** Armour piece that took part of the hit, or `null`. */
      readonly armour: ArmourPiece | null;
    }
  | {
      /** A hit on anything with health. Emitted alongside the older per-kind events. */
      readonly type: 'entity-damaged';
      readonly entity: EntityRef;
      readonly point: Vec3;
      /** Most valuable zone struck by this trigger pull. */
      readonly zone: HitZone;
      /** Health lost after armour. */
      readonly damage: number;
      /** Damage soaked up by armour. */
      readonly absorbed: number;
      /** Armour piece that took part of the hit, or `null`. */
      readonly armour: ArmourPiece | null;
      readonly healthRemaining: number;
      readonly maxHealth: number;
      readonly distance: number;
      readonly killed: boolean;
    }
  | {
      readonly type: 'entity-down';
      readonly entity: EntityRef;
      readonly weaponId: WeaponId;
      readonly headshot: boolean;
      readonly distance: number;
    }
  | { readonly type: 'armor-broken'; readonly entity: EntityRef; readonly piece: ArmourPiece }
  | { readonly type: 'consumable-start'; readonly id: ConsumableId; readonly duration: number }
  | {
      readonly type: 'consumable-complete';
      readonly id: ConsumableId;
      readonly health: number;
      readonly boost: number;
    }
  | {
      readonly type: 'consumable-cancel';
      readonly id: ConsumableId;
      readonly reason: ConsumableCancelReason;
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
  /**
   * Damageable dummies have no separate head box: a hit in the upper third of the silhouette
   * (measured from `bodyBottom` to `headTop`) counts as a headshot.
   */
  dummyHeadShare: 1 / 3,
} as const;

/** Zone struck on a damageable dummy by a hit at world height `y`. */
export function dummyHitZone(y: number): HitZone {
  const height = TARGET.headTop - TARGET.bodyBottom;
  return y >= TARGET.headTop - height * TARGET.dummyHeadShare ? 'head' : 'torso';
}

function createTargetVitals(spawn: TargetSpawn): TargetVitals | null {
  if (spawn.health === undefined || spawn.health <= 0) return null;
  return {
    health: spawn.health,
    maxHealth: spawn.health,
    armour: createArmour(spawn.vest ?? 0, spawn.helmet ?? 0),
    revealRemaining: 0,
  };
}

/** Damage one trigger pull has done to one target so far. */
interface PendingHit {
  readonly vitals: Vitals;
  readonly healthLost: number;
  readonly absorbed: number;
  readonly zone: HitZone;
  readonly point: Vec3;
  readonly distance: number;
  readonly armour: ArmourPiece | null;
  readonly broken: readonly ArmourPiece[];
  readonly killed: boolean;
}

/** Fold one more projectile into the running total for a target. */
function addProjectileHit(
  previous: PendingHit | undefined,
  target: Vitals,
  rawDamage: number,
  zone: HitZone,
  armourPiercing: number,
  point: Vec3,
  distance: number,
): PendingHit {
  const before = previous?.vitals ?? target;
  const result = applyDamage(before, rawDamage, zone, armourPiercing);
  const vitals: Vitals = {
    health: result.health,
    maxHealth: before.maxHealth,
    armour: result.armour,
  };
  if (!previous) {
    return {
      vitals,
      healthLost: result.healthLost,
      absorbed: result.absorbed,
      zone,
      point,
      distance,
      armour: result.piece,
      broken: result.broken ? [result.broken] : [],
      killed: result.killed,
    };
  }
  return {
    vitals,
    healthLost: previous.healthLost + result.healthLost,
    absorbed: previous.absorbed + result.absorbed,
    zone: previous.zone === 'head' || zone === 'head' ? 'head' : previous.zone,
    point: previous.point,
    distance: Math.min(previous.distance, distance),
    armour: previous.armour ?? result.piece,
    broken: result.broken ? [...previous.broken, result.broken] : previous.broken,
    killed: previous.killed || result.killed,
  };
}

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
  return loadoutWeaponSpec(state.weapon.loadout, state.weapon.weaponId);
}

const PLAYER_ENTITY: EntityRef = { kind: 'player' };

/**
 * The enemy or dummy the raised sights rest on, if the player hurt it recently enough for its
 * health to be readable. Walls block the readout exactly as they block a bullet.
 */
function findAimedTarget(
  player: PlayerState,
  weapon: WeaponState,
  range: number,
  map: GameMap,
  enemies: readonly EnemyState[],
  targetsDown: readonly boolean[],
  targetVitals: readonly (TargetVitals | null)[],
): AimedTarget | null {
  const anyEnemy = enemies.some((enemy) => enemy.alive && enemy.revealRemaining > 0);
  const anyDummy = targetVitals.some((vitals) => vitals !== null && vitals.revealRemaining > 0);
  if (!anyEnemy && !anyDummy) return null;

  const origin = eyePosition(player);
  const direction = aimDirection(player.yaw + weapon.recoilYaw, player.pitch + weapon.recoil);
  const wallHit = raycast(origin, direction, range, map.solids);
  const maxDist = wallHit ? wallHit.distance : range;

  if (anyEnemy) {
    const enemyHit = raycastEnemies(origin, direction, maxDist, enemies);
    const enemy = enemyHit ? enemies[enemyHit.enemyIndex] : undefined;
    if (enemy && enemy.revealRemaining > 0) {
      return {
        entity: { kind: 'enemy', id: enemy.id },
        health: enemy.health,
        maxHealth: enemy.maxHealth,
      };
    }
  }

  if (anyDummy) {
    let best: AimedTarget | null = null;
    let bestDistance = maxDist;
    for (let index = 0; index < map.targets.length; index++) {
      const spawn = map.targets[index];
      const vitals = targetVitals[index];
      if (!spawn || !vitals || targetsDown[index] || vitals.revealRemaining <= 0) continue;
      const hit = raycast(origin, direction, bestDistance, targetHitBoxes(spawn));
      if (!hit) continue;
      bestDistance = hit.distance;
      best = {
        entity: { kind: 'dummy', index },
        health: vitals.health,
        maxHealth: vitals.maxHealth,
      };
    }
    return best;
  }
  return null;
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
    Boolean(input.switchSlot) ||
    Boolean(input.useConsumable)
  );
}

export interface CreateGameOptions {
  readonly mode?: GameModeId;
  readonly seed?: number;
  /** Vest level to start with; defaults to the mode's. */
  readonly vest?: number;
  /** Helmet level to start with; defaults to the mode's. */
  readonly helmet?: number;
  /** Healing and boost items to start with; defaults to the mode's. */
  readonly consumables?: ConsumableInventory;
  /** Boost meter to start with (0..100); defaults to 0. */
  readonly boost?: number;
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
    playerArmour: createArmour(
      options.vest ?? modeSpec.startingVest,
      options.helmet ?? modeSpec.startingHelmet,
    ),
    playerBoost: Math.min(BOOST_TUNING.max, Math.max(0, options.boost ?? 0)),
    consumables: sanitizeConsumables(options.consumables ?? modeSpec.startingConsumables),
    consumableUse: null,
    lastDamageDir: null,
    damagePulse: 0,
    weapon: initialWeapon,
    enemies: spawnedEnemies,
    targetsDown: spawnedTargets,
    targetVitals: modeSpec.usesEnemies ? [] : map.targets.map(createTargetVitals),
    aimedTarget: null,
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
  let playerArmour = state.playerArmour;
  let playerDamaged = false;
  let lastDamageDir = state.lastDamageDir;
  let damagePulse = Math.max(0, state.damagePulse - dt * 2.4);
  let enemies: EnemyState[] = [...state.enemies];
  let targetsDown = state.targetsDown;
  let targetVitals = state.targetVitals;
  let resetIn = state.resetIn;
  let { elapsed, active, shotsFired, targetHits, enemiesDown, headshots, damageTaken } = state.run;

  // Practice mode target auto-reset countdown.
  if (!modeSpec.usesEnemies && resetIn > 0) {
    resetIn = Math.max(0, resetIn - dt);
    if (resetIn === 0) {
      targetsDown = targetsDown.map(() => false);
      targetVitals = map.targets.map(createTargetVitals);
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
        aimedTarget: null,
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

  // Applying a healing or boost item ties up the hands: the weapon cannot fire until it is done.
  const usingItem = state.consumableUse !== null;
  const pulledTrigger = usingItem && input.fire && !state.weapon.triggerHeld;
  const weaponStep = stepWeapon(
    state.weapon,
    usingItem ? { ...effectiveInput, fire: false } : effectiveInput,
    dt,
  );
  let nextWeaponState = usingItem
    ? { ...weaponStep.state, triggerHeld: input.fire }
    : weaponStep.state;
  const spec = loadoutWeaponSpec(nextWeaponState.loadout, nextWeaponState.weaponId);
  let resolvedThisStep = false;
  let switchedWeapon = false;

  for (const event of weaponStep.events) {
    if (event === 'weapon-switch') {
      switchedWeapon = true;
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
    const shotYaw = player.yaw + state.weapon.recoilYaw;
    const baseDirection = aimDirection(shotYaw, shotPitch);
    const directions = pelletDirections(
      shotYaw,
      shotPitch,
      spec,
      state.weapon.aim,
      nextWeaponState.shotSequence,
    );

    if (modeSpec.usesEnemies) {
      // Alert combatants within earshot; quieter weapons carry less far.
      enemies = alertEnemiesByGunshot(
        enemies,
        player.position,
        modeSpec.tuning,
        spec.noiseRadiusScale,
      );

      const hits: ShotImpact[] = [];
      let connectedEnemyThisTriggerPull = false;

      // Damage per enemy across multi-pellet buckshot or a single rifle projectile.
      const pendingDamage = new Map<number, PendingHit>();

      for (const direction of directions) {
        const wallHit = raycast(origin, direction, spec.range, map.solids);
        const maxDist = wallHit ? wallHit.distance : spec.range;
        const enemyHit = raycastEnemies(origin, direction, maxDist, enemies);
        const struck = enemyHit ? enemies[enemyHit.enemyIndex] : undefined;

        if (enemyHit && struck) {
          connectedEnemyThisTriggerPull = true;
          hits.push({
            point: enemyHit.point,
            normal: enemyHit.normal,
            distance: enemyHit.distance,
            surface: 'enemy',
            hitZone: enemyHit.zone,
          });
          pendingDamage.set(
            enemyHit.enemyIndex,
            addProjectileHit(
              pendingDamage.get(enemyHit.enemyIndex),
              struck,
              weaponProjectileDamage(spec, enemyHit.distance, enemyHit.zone),
              enemyHit.zone,
              spec.armourPiercing,
              enemyHit.point,
              enemyHit.distance,
            ),
          );
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
        suppressed: spec.suppressed,
        muzzleFlash: spec.muzzleFlashScale,
      });

      if (connectedEnemyThisTriggerPull && !resolvedBeforeStep && !resolvedThisStep) {
        targetHits++;
      }

      for (const [enemyIdx, info] of pendingDamage) {
        const targetEnemy = enemies[enemyIdx];
        if (!targetEnemy) continue;
        const applied = damageEnemy(targetEnemy, info.healthLost, player.position, modeSpec.tuning);
        enemies[enemyIdx] = {
          ...applied.enemy,
          armour: info.vitals.armour,
          revealRemaining: TARGET_HEALTH_REVEAL.seconds,
        };
        const entity: EntityRef = { kind: 'enemy', id: targetEnemy.id };
        events.push({
          type: 'enemy-hit',
          enemyId: targetEnemy.id,
          point: info.point,
          zone: info.zone,
          damage: Math.round(info.healthLost),
          killed: applied.killed,
          distance: info.distance,
        });
        events.push({
          type: 'entity-damaged',
          entity,
          point: info.point,
          zone: info.zone,
          damage: info.healthLost,
          absorbed: info.absorbed,
          armour: info.armour,
          healthRemaining: applied.enemy.health,
          maxHealth: targetEnemy.maxHealth,
          distance: info.distance,
          killed: applied.killed,
        });
        for (const piece of info.broken) {
          events.push({ type: 'armor-broken', entity, piece });
        }

        if (applied.killed) {
          enemiesDown++;
          const wasHeadshot = info.zone === 'head';
          if (wasHeadshot) headshots++;
          const remaining = enemies.filter((e) => e.alive).length;
          events.push({
            type: 'enemy-down',
            enemyId: targetEnemy.id,
            headshot: wasHeadshot,
            distance: info.distance,
            remaining,
          });
          events.push({
            type: 'entity-down',
            entity,
            weaponId: spec.id,
            headshot: wasHeadshot,
            distance: info.distance,
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
      // Practice mode: steel plates drop to any hit, dummies take damage like a combatant.
      const targetIndexes = map.targets.flatMap((_, index) =>
        targetsDown[index] ? [] : [index, index],
      );
      const targetBoxes = map.targets.flatMap((spawn, index) =>
        targetsDown[index] ? [] : targetHitBoxes(spawn),
      );
      const raySolids: Box[] = [...map.solids, ...targetBoxes];

      const hits: ShotImpact[] = [];
      const knockedThisShot = new Map<number, number>();
      const pendingDamage = new Map<number, PendingHit>();
      let connectedThisTriggerPull = false;

      for (const direction of directions) {
        const hit = raycast(origin, direction, spec.range, raySolids);
        if (!hit) continue;
        const mapSolid = map.solids[hit.index];
        const point = add(origin, scale(direction, hit.distance));
        const targetIndex = targetIndexes[hit.index - map.solids.length];
        const dummy = targetIndex === undefined ? null : (targetVitals[targetIndex] ?? null);
        const zone = dummy ? dummyHitZone(point.y) : undefined;
        hits.push({
          point,
          normal: hit.normal,
          distance: hit.distance,
          surface: mapSolid ? mapSolid.material : dummy ? 'enemy' : 'target',
          ...(zone ? { hitZone: zone } : {}),
        });

        if (targetIndex === undefined) continue;
        connectedThisTriggerPull = true;
        if (dummy && zone) {
          pendingDamage.set(
            targetIndex,
            addProjectileHit(
              pendingDamage.get(targetIndex),
              dummy,
              weaponProjectileDamage(spec, hit.distance, zone),
              zone,
              spec.armourPiercing,
              point,
              hit.distance,
            ),
          );
        } else if (!knockedThisShot.has(targetIndex)) {
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
        suppressed: spec.suppressed,
        muzzleFlash: spec.muzzleFlashScale,
      });

      if (connectedThisTriggerPull && !resolvedBeforeStep && !resolvedThisStep) {
        targetHits++;
      }

      if (pendingDamage.size > 0) {
        const nextVitals = [...targetVitals];
        for (const [targetIndex, info] of pendingDamage) {
          const entity: EntityRef = { kind: 'dummy', index: targetIndex };
          nextVitals[targetIndex] = {
            ...info.vitals,
            revealRemaining: TARGET_HEALTH_REVEAL.seconds,
          };
          events.push({
            type: 'entity-damaged',
            entity,
            point: info.point,
            zone: info.zone,
            damage: info.healthLost,
            absorbed: info.absorbed,
            armour: info.armour,
            healthRemaining: info.vitals.health,
            maxHealth: info.vitals.maxHealth,
            distance: info.distance,
            killed: info.killed,
          });
          for (const piece of info.broken) {
            events.push({ type: 'armor-broken', entity, piece });
          }
          if (info.killed) {
            knockedThisShot.set(targetIndex, info.distance);
            events.push({
              type: 'entity-down',
              entity,
              weaponId: spec.id,
              headshot: info.zone === 'head',
              distance: info.distance,
            });
          }
        }
        targetVitals = nextVitals;
      }

      if (knockedThisShot.size > 0) {
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
        const struck = applyDamage(
          { health: playerHealth, maxHealth: state.playerMaxHealth, armour: playerArmour },
          eShot.damageToPlayer,
          eShot.zone,
          eShot.armourPiercing,
        );
        const appliedDamage = struck.healthLost;
        playerHealth = struck.health;
        playerArmour = struck.armour;
        playerDamaged = true;
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
          zone: eShot.zone,
          armour: struck.piece,
        });
        events.push({
          type: 'entity-damaged',
          entity: PLAYER_ENTITY,
          point: eShot.endPoint,
          zone: eShot.zone,
          damage: appliedDamage,
          absorbed: struck.absorbed,
          armour: struck.piece,
          healthRemaining: playerHealth,
          maxHealth: state.playerMaxHealth,
          distance: dLen,
          killed: struck.killed,
        });
        if (struck.broken) {
          events.push({ type: 'armor-broken', entity: PLAYER_ENTITY, piece: struck.broken });
        }

        if (playerHealth === 0) {
          outcome = 'defeat';
          active = false;
          resolvedThisStep = true;
          events.push({ type: 'player-down' });
        }
      }
    }
  }

  // Healing items, boost drain and boost regeneration.
  const survival = stepSurvival(
    {
      health: playerHealth,
      maxHealth: state.playerMaxHealth,
      boost: state.playerBoost,
      inventory: state.consumables,
      use: state.consumableUse,
    },
    {
      request: outcome === 'ongoing' ? (input.useConsumable ?? null) : null,
      fired: pulledTrigger,
      damaged: playerDamaged,
      switched: switchedWeapon,
    },
    dt,
  );
  playerHealth = survival.state.health;
  for (const event of survival.events) events.push(event);

  // Health readouts fade a fixed time after the player last hurt the target.
  if (targetVitals.some((vitals) => vitals !== null && vitals.revealRemaining > 0)) {
    targetVitals = targetVitals.map((vitals) =>
      vitals === null || vitals.revealRemaining === 0
        ? vitals
        : { ...vitals, revealRemaining: Math.max(0, vitals.revealRemaining - dt) },
    );
  }
  const aimedTarget =
    nextWeaponState.aim >= TARGET_HEALTH_REVEAL.minAim
      ? findAimedTarget(
          player,
          nextWeaponState,
          spec.range,
          map,
          enemies,
          targetsDown,
          targetVitals,
        )
      : null;

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
      playerArmour,
      playerBoost: survival.state.boost,
      consumables: survival.state.inventory,
      consumableUse: survival.state.use,
      lastDamageDir,
      damagePulse,
      weapon: nextWeaponState,
      enemies,
      targetsDown,
      targetVitals,
      aimedTarget,
      resetIn,
      run,
      rngState: rng.getState(),
    },
    events,
  };
}
