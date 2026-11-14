import type { Box } from './collision';
import { raycast } from './collision';
import type { EnemyState } from './enemy';
import {
  createEnemies,
  enemyBlocker,
  hearGunshot,
  enemyHitBoxes,
  hitEnemy,
  isEnemyAlive,
  stepEnemies,
} from './enemy';
import type { GameMap, SurfaceMaterial, TargetSpawn } from './map';
import type { GameModeId } from './mode';
import { DEFAULT_MODE, gameMode } from './mode';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, eyePosition, stepPlayer } from './player';
import type { Vec3 } from './vec';
import { add, clamp, scale } from './vec';
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
  pelletDirections,
  resolveWeaponOptic,
  stepWeapon,
} from './weapon';

export type GameInput = PlayerInput & WeaponInput;

export interface RunStats {
  /** Seconds elapsed in the current run; freezes when the run ends. */
  readonly elapsed: number;
  /** True once the player acts in the current run. */
  readonly active: boolean;
  /** Shots fired in the current run. */
  readonly shotsFired: number;
  /** Shots in the current run that hit a hostile or a steel plate. */
  readonly hits: number;
  /** Hostiles neutralised in the current run. */
  readonly kills: number;
}

export type RunStatus = 'playing' | 'won' | 'lost';

export const PLAYER_COMBAT = {
  maxHealth: 100,
  /** Seconds without being hit before health starts coming back. */
  regenDelay: 5,
  regenPerSecond: 22,
} as const;

/** How long the end-of-run banner stays up before the run starts again. */
export const RUN_END_COUNTDOWN: Readonly<Record<GameModeId, number>> = {
  firefight: 6,
  steel: 3,
};

export interface GameState {
  readonly mode: GameModeId;
  /** Seeded randomness for hostile behaviour; part of the state so replays match. */
  readonly seed: number;
  readonly player: PlayerState;
  readonly weapon: WeaponState;
  readonly health: number;
  /** Seconds since the player was last hit, for health regeneration. */
  readonly sinceDamage: number;
  readonly enemies: readonly EnemyState[];
  /** True for each steel plate that has been knocked down. */
  readonly targetsDown: readonly boolean[];
  /** Seconds until the run starts over; > 0 once the run has ended. */
  readonly resetIn: number;
  readonly run: RunStats;
  readonly status: RunStatus;
}

export interface ShotImpact {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly surface: SurfaceMaterial | 'target' | 'enemy';
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
  | { readonly type: 'target-down'; readonly index: number; readonly distance: number }
  | {
      readonly type: 'enemy-damaged';
      readonly index: number;
      readonly damage: number;
      readonly headshot: boolean;
      readonly point: Vec3;
      readonly normal: Vec3;
      readonly distance: number;
    }
  | { readonly type: 'enemy-killed'; readonly index: number; readonly distance: number }
  | {
      readonly type: 'enemy-shot';
      readonly index: number;
      readonly origin: Vec3;
      readonly direction: Vec3;
      readonly impact: ShotImpact | null;
      readonly playerHit: boolean;
    }
  | { readonly type: 'enemy-reload'; readonly index: number }
  | {
      readonly type: 'player-damaged';
      readonly amount: number;
      /** Horizontal unit vector from the player toward whoever shot them. */
      readonly direction: Vec3;
      readonly health: number;
    }
  | { readonly type: 'run-end'; readonly outcome: 'won' | 'lost' }
  | { readonly type: 'run-reset' }
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
} as const;

/** Head hits do more damage than body hits, so aiming carefully is worth the risk. */
export const HEADSHOT_MULTIPLIER = 2;

function slab(spawn: TargetSpawn, width: number, depth: number, bottom: number, top: number): Box {
  const { x, z } = spawn.position;
  // The plate is thin along the axis it faces and wide along the other one.
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

/** Point a shooter should aim at. */
export function targetCentre(spawn: TargetSpawn): Vec3 {
  return { x: spawn.position.x, y: (TARGET.bodyBottom + TARGET.bodyTop) / 2, z: spawn.position.z };
}

function targetBlocker(spawn: TargetSpawn): Box {
  return slab(spawn, TARGET.bodyWidth, TARGET.standDepth, 0, TARGET.headTop);
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
  hits: 0,
  kills: 0,
};

/** Accuracy percentage (0..100) for a run, or 0 before firing. */
export function runAccuracyPercent(run: RunStats): number {
  if (run.shotsFired === 0) return 0;
  return Math.min(100, Math.round((run.hits / run.shotsFired) * 100));
}

export function aliveEnemies(state: GameState): readonly EnemyState[] {
  return state.enemies.filter(isEnemyAlive);
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

export interface GameOptions {
  readonly mode?: GameModeId;
  readonly loadout?: Loadout;
  readonly activeSlot?: WeaponSlot;
  readonly seed?: number;
}

export const DEFAULT_SEED = 0x5eed1;

export function createGame(map: GameMap, options: GameOptions = {}): GameState {
  const mode = options.mode ?? DEFAULT_MODE;
  const spec = gameMode(mode);
  return {
    mode,
    seed: options.seed ?? DEFAULT_SEED,
    player: createPlayer(map.spawn.position, map.spawn.yaw),
    weapon: createWeapon(options.loadout ?? DEFAULT_LOADOUT, options.activeSlot ?? 'primary'),
    health: PLAYER_COMBAT.maxHealth,
    sinceDamage: PLAYER_COMBAT.regenDelay,
    enemies: spec.enemies ? createEnemies(map) : [],
    targetsDown: map.targets.map(() => false),
    resetIn: 0,
    run: INITIAL_RUN_STATS,
    status: 'playing',
  };
}

/** Update the player's carried loadout without disturbing their position or run. */
export function setGameLoadout(
  state: GameState,
  loadout: Loadout,
  activeSlot: WeaponSlot = state.weapon.activeSlot,
): GameState {
  return {
    ...state,
    weapon: equipLoadout(state.weapon, loadout, activeSlot),
  };
}

/** A fresh run of the same mode with the same seed, used by restart and the end countdown. */
export function restartGame(state: GameState, map: GameMap): GameState {
  return createGame(map, {
    mode: state.mode,
    loadout: state.weapon.loadout,
    activeSlot: state.weapon.activeSlot,
    seed: state.seed,
  });
}

interface BoxTargets {
  readonly enemyIds: readonly number[];
  readonly enemyHeads: readonly boolean[];
  readonly targetIndexes: readonly number[];
}

/** Lay out every box a player shot can hit, and remember what each one belongs to. */
function shotBoxes(
  map: GameMap,
  enemies: readonly EnemyState[],
  targetsDown: readonly boolean[],
): { boxes: Box[]; targets: BoxTargets } {
  const boxes: Box[] = [...map.solids];
  const enemyIds: number[] = [];
  const enemyHeads: boolean[] = [];
  for (const enemy of enemies) {
    if (!isEnemyAlive(enemy)) continue;
    const hitBoxes = enemyHitBoxes(enemy);
    boxes.push(hitBoxes.body, hitBoxes.head);
    enemyIds.push(enemy.id, enemy.id);
    enemyHeads.push(false, true);
  }
  const targetIndexes: number[] = [];
  map.targets.forEach((spawn, index) => {
    if (targetsDown[index]) return;
    boxes.push(...targetHitBoxes(spawn));
    targetIndexes.push(index, index);
  });
  return { boxes, targets: { enemyIds, enemyHeads, targetIndexes } };
}

export function stepGame(
  state: GameState,
  input: GameInput,
  dt: number,
  map: GameMap,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // The end-of-run banner counts down, then the same run starts over cleanly.
  if (state.resetIn > 0) {
    const resetIn = Math.max(0, state.resetIn - dt);
    if (resetIn === 0) {
      events.push({ type: 'run-reset' });
      return { state: restartGame(state, map), events };
    }
    return { state: { ...state, resetIn }, events };
  }

  const playing = state.status === 'playing';
  const effectiveInput: GameInput = playing
    ? input
    : {
        ...input,
        forward: 0,
        right: 0,
        jump: false,
        sprint: false,
        lean: 0,
        aim: false,
        reload: false,
        fire: false,
        yawDelta: 0,
        pitchDelta: 0,
      };

  let targetsDown = state.targetsDown;
  let health = state.health;
  let sinceDamage = state.sinceDamage;
  let seed = state.seed;
  let enemies = state.enemies;
  let { elapsed, active, shotsFired, hits, kills } = state.run;

  const spec = gameMode(state.mode);
  const enemiesCleared = spec.enemies && enemies.every((enemy) => !isEnemyAlive(enemy));
  const targetsCleared = spec.targets && targetsDown.length > 0 && targetsDown.every(Boolean);
  const runOver = enemiesCleared || targetsCleared;

  if (playing && !runOver && !active && hasRunAction(effectiveInput)) {
    active = true;
  }

  // Living hostiles and standing plates block the player; corpses and fallen plates do not.
  const standing = spec.targets ? map.targets.filter((_, index) => !targetsDown[index]) : [];
  const solids: Box[] = [
    ...map.solids,
    ...enemies.filter(isEnemyAlive).map(enemyBlocker),
    ...standing.map(targetBlocker),
  ];
  const playerStep = stepPlayer(state.player, effectiveInput, dt, solids);
  const player = playerStep.state;
  if (playerStep.jumped) events.push({ type: 'jump' });
  if (playerStep.landedSpeed !== null) events.push({ type: 'land', speed: playerStep.landedSpeed });

  const weaponStep = stepWeapon(state.weapon, effectiveInput, dt);
  const weaponSpec = effectiveWeaponSpec(
    weaponStep.state.weaponId,
    resolveWeaponOptic(weaponStep.state.loadout, weaponStep.state.weaponId),
  );

  // Declared as the union so the compiler knows a closure can widen it.
  let status: RunStatus = state.status;
  const ended = (): boolean => status !== 'playing';
  const finishRun = (outcome: 'won' | 'lost') => {
    if (ended()) return;
    status = outcome === 'won' ? 'won' : 'lost';
    active = false;
    events.push({ type: 'run-end', outcome });
  };

  for (const event of weaponStep.events) {
    if (event === 'weapon-switch') {
      events.push({
        type: 'weapon-switch',
        weaponId: weaponStep.state.weaponId,
        slot: weaponStep.state.activeSlot,
      });
      continue;
    }
    if (event === 'zoom-toggle') {
      const nextZoom =
        weaponSpec.zoomStages.length === 2 && weaponStep.state.zoomStage === 1
          ? weaponSpec.zoomStages[1]
          : weaponSpec.zoomStages[0];
      events.push({ type: 'zoom-toggle', zoom: nextZoom });
      continue;
    }
    if (event !== 'shot') {
      events.push({ type: event });
      continue;
    }

    shotsFired++;

    // Fire from the eye, wherever leaning has put it, along the aim as it was before
    // this shot's own kick.
    const origin = eyePosition(player);
    const shotPitch = player.pitch + state.weapon.recoil;
    const baseDirection = aimDirection(player.yaw, shotPitch);
    const directions = pelletDirections(
      player.yaw,
      shotPitch,
      weaponSpec,
      state.weapon.aim,
      weaponStep.state.shotSequence,
    );

    const layout = shotBoxes(map, enemies, targetsDown);
    const enemyStart = map.solids.length;
    const enemyEnd = enemyStart + layout.targets.enemyIds.length;
    const hitsList: ShotImpact[] = [];
    const damageByEnemy = new Map<
      number,
      { damage: number; headshot: boolean; point: Vec3; normal: Vec3; distance: number }
    >();
    const knockedThisShot = new Map<number, number>();
    let scoredHit = false;

    for (const direction of directions) {
      const hit = raycast(origin, direction, weaponSpec.range, layout.boxes);
      if (!hit) continue;
      const point = add(origin, scale(direction, hit.distance));

      if (hit.index >= enemyStart && hit.index < enemyEnd) {
        const offset = hit.index - enemyStart;
        const enemyId = layout.targets.enemyIds[offset];
        const headshot = layout.targets.enemyHeads[offset] ?? false;
        if (enemyId === undefined) continue;
        const damage = weaponSpec.damage * (headshot ? HEADSHOT_MULTIPLIER : 1);
        const existing = damageByEnemy.get(enemyId);
        damageByEnemy.set(enemyId, {
          damage: (existing?.damage ?? 0) + damage,
          headshot: headshot || (existing?.headshot ?? false),
          point: existing?.point ?? point,
          normal: existing?.normal ?? hit.normal,
          distance: existing?.distance ?? hit.distance,
        });
        hitsList.push({ point, normal: hit.normal, distance: hit.distance, surface: 'enemy' });
        scoredHit = true;
        continue;
      }

      if (hit.index >= enemyEnd) {
        const targetIndex = layout.targets.targetIndexes[hit.index - enemyEnd];
        hitsList.push({ point, normal: hit.normal, distance: hit.distance, surface: 'target' });
        if (targetIndex !== undefined) {
          scoredHit = true;
          if (!knockedThisShot.has(targetIndex)) knockedThisShot.set(targetIndex, hit.distance);
        }
        continue;
      }

      const mapSolid = map.solids[hit.index];
      hitsList.push({
        point,
        normal: hit.normal,
        distance: hit.distance,
        surface: mapSolid ? mapSolid.material : 'concrete',
      });
    }

    events.push({
      type: 'shot',
      weaponId: weaponStep.state.weaponId,
      origin,
      direction: baseDirection,
      hit: hitsList[0] ?? null,
      hits: hitsList,
    });

    // Hostiles within earshot turn toward the shot; the ones that can see the player are
    // already handled by the hostile step below.
    enemies = hearGunshot(enemies, player.position);

    if (scoredHit) hits++;

    if (damageByEnemy.size > 0) {
      const next = enemies.map((enemy) => {
        const dealt = damageByEnemy.get(enemy.id);
        if (!dealt) return enemy;
        const wasAlive = isEnemyAlive(enemy);
        const damaged = hitEnemy(enemy, dealt.damage, player.position);
        events.push({
          type: 'enemy-damaged',
          index: enemy.id,
          damage: Math.min(dealt.damage, enemy.health),
          headshot: dealt.headshot,
          point: dealt.point,
          normal: dealt.normal,
          distance: dealt.distance,
        });
        if (wasAlive && !isEnemyAlive(damaged)) {
          kills++;
          events.push({ type: 'enemy-killed', index: enemy.id, distance: dealt.distance });
        }
        return damaged;
      });
      enemies = next;
    }

    if (knockedThisShot.size > 0) {
      targetsDown = targetsDown.map((down, index) => down || knockedThisShot.has(index));
      for (const [targetIndex, distance] of knockedThisShot) {
        events.push({ type: 'target-down', index: targetIndex, distance });
      }
    }
  }

  // Hostiles act on the state after the player's shots, so a hostile shot this step is
  // never fired by one that has just been killed.
  if (playing && !ended()) {
    const enemyStep = stepEnemies(enemies, player, map, dt, seed);
    enemies = enemyStep.enemies;
    seed = enemyStep.seed;
    for (const event of enemyStep.events) {
      if (event.type === 'enemy-reload') {
        events.push({ type: 'enemy-reload', index: event.index });
        continue;
      }
      events.push({
        type: 'enemy-shot',
        index: event.index,
        origin: event.origin,
        direction: event.direction,
        impact: event.impact,
        playerHit: event.playerHit,
      });
      if (!event.playerHit || event.damage <= 0) continue;
      health = Math.max(0, health - event.damage);
      sinceDamage = 0;
      // Being shot at is the fight starting, even if the player has not moved yet.
      active = true;
      const dx = event.origin.x - player.position.x;
      const dz = event.origin.z - player.position.z;
      const length = Math.hypot(dx, dz) || 1;
      events.push({
        type: 'player-damaged',
        amount: event.damage,
        direction: { x: dx / length, y: 0, z: dz / length },
        health,
      });
      if (health === 0) finishRun('lost');
    }
  }

  if (playing && !ended()) {
    sinceDamage = clamp(sinceDamage + dt, 0, 60);
    if (
      spec.enemies &&
      health < PLAYER_COMBAT.maxHealth &&
      sinceDamage >= PLAYER_COMBAT.regenDelay
    ) {
      health = Math.min(PLAYER_COMBAT.maxHealth, health + PLAYER_COMBAT.regenPerSecond * dt);
    }
  }

  if (playing && !ended()) {
    const clearedEnemies = spec.enemies && enemies.every((enemy) => !isEnemyAlive(enemy));
    const clearedTargets = spec.targets && targetsDown.length > 0 && targetsDown.every(Boolean);
    if (clearedEnemies || clearedTargets) finishRun('won');
  }

  if (!ended() && playing && active) elapsed += dt;

  const run: RunStats =
    elapsed === state.run.elapsed &&
    active === state.run.active &&
    shotsFired === state.run.shotsFired &&
    hits === state.run.hits &&
    kills === state.run.kills
      ? state.run
      : { elapsed, active, shotsFired, hits, kills };

  return {
    state: {
      ...state,
      player,
      weapon: weaponStep.state,
      health,
      sinceDamage,
      enemies,
      targetsDown,
      resetIn: ended() ? RUN_END_COUNTDOWN[state.mode] : state.resetIn,
      run,
      status,
      seed,
    },
    events,
  };
}
