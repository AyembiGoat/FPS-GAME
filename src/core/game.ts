import type { Box } from './collision';
import { raycast } from './collision';
import type { GameMap, SurfaceMaterial, TargetSpawn } from './map';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, eyePosition, stepPlayer } from './player';
import type { Vec3 } from './vec';
import { add, scale } from './vec';
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
  /** Seconds elapsed in the current run; freezes once all targets are knocked down. */
  readonly elapsed: number;
  /** True once the player acts in the current run and until all targets are down. */
  readonly active: boolean;
  /** Shots fired in the current run. */
  readonly shotsFired: number;
  /** Shots that hit a standing target in the current run. */
  readonly targetHits: number;
}

export interface GameState {
  readonly player: PlayerState;
  readonly weapon: WeaponState;
  /** True for each target that has been knocked down. */
  readonly targetsDown: readonly boolean[];
  /** Seconds until the targets stand back up; 0 while any is still standing. */
  readonly resetIn: number;
  /** Telemetry for the current target-clearing run. */
  readonly run: RunStats;
}

export interface ShotImpact {
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly distance: number;
  readonly surface: SurfaceMaterial | 'target';
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
  targetHits: 0,
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

export function createGame(
  map: GameMap,
  loadout: Loadout = DEFAULT_LOADOUT,
  activeSlot: WeaponSlot = 'primary',
): GameState {
  return {
    player: createPlayer(map.spawn.position, map.spawn.yaw),
    weapon: createWeapon(loadout, activeSlot),
    targetsDown: map.targets.map(() => false),
    resetIn: 0,
    run: INITIAL_RUN_STATS,
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

export function stepGame(
  state: GameState,
  input: GameInput,
  dt: number,
  map: GameMap,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let targetsDown = state.targetsDown;
  let resetIn = state.resetIn;
  let { elapsed, active, shotsFired, targetHits } = state.run;

  if (resetIn > 0) {
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

  const allDownBeforeStep = resetIn > 0 || (map.targets.length > 0 && targetsDown.every(Boolean));
  if (!allDownBeforeStep && !active && hasRunAction(input)) {
    active = true;
  }

  const standing = map.targets.filter((_, index) => !targetsDown[index]);
  const solids: Box[] = [...map.solids, ...standing.map(targetBlocker)];
  const playerStep = stepPlayer(state.player, input, dt, solids);
  const player = playerStep.state;
  if (playerStep.jumped) events.push({ type: 'jump' });
  if (playerStep.landedSpeed !== null) events.push({ type: 'land', speed: playerStep.landedSpeed });

  const weaponStep = stepWeapon(state.weapon, input, dt);
  const spec = effectiveWeaponSpec(
    weaponStep.state.weaponId,
    resolveWeaponOptic(weaponStep.state.loadout, weaponStep.state.weaponId),
  );
  let clearedThisStep = false;

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
        spec.zoomStages.length === 2 && weaponStep.state.zoomStage === 1
          ? spec.zoomStages[1]
          : spec.zoomStages[0];
      events.push({ type: 'zoom-toggle', zoom: nextZoom });
      continue;
    }
    if (event !== 'shot') {
      events.push({ type: event });
      continue;
    }

    if (!allDownBeforeStep && !clearedThisStep) {
      shotsFired++;
    }

    // Fire from the eye, wherever leaning has put it, along the aim as it was before
    // this shot's own kick.
    const origin = eyePosition(player);
    const shotPitch = player.pitch + state.weapon.recoil;
    const baseDirection = aimDirection(player.yaw, shotPitch);
    const directions = pelletDirections(
      player.yaw,
      shotPitch,
      spec,
      state.weapon.aim,
      weaponStep.state.shotSequence,
    );

    // Hit boxes go after the map solids so an index tells us which kind was hit.
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
      weaponId: weaponStep.state.weaponId,
      origin,
      direction: baseDirection,
      hit: hits[0] ?? null,
      hits,
    });

    if (knockedThisShot.size > 0) {
      if (!allDownBeforeStep && !clearedThisStep) {
        targetHits++;
      }
      targetsDown = targetsDown.map((down, index) => down || knockedThisShot.has(index));
      for (const [targetIndex, distance] of knockedThisShot) {
        events.push({ type: 'target-down', index: targetIndex, distance });
      }
      if (targetsDown.every(Boolean)) {
        resetIn = TARGET.resetDelay;
        active = false;
        clearedThisStep = true;
      }
    }
  }

  if (active && !allDownBeforeStep && !clearedThisStep) {
    elapsed += dt;
  }

  const run: RunStats =
    elapsed === state.run.elapsed &&
    active === state.run.active &&
    shotsFired === state.run.shotsFired &&
    targetHits === state.run.targetHits
      ? state.run
      : { elapsed, active, shotsFired, targetHits };

  return { state: { player, weapon: weaponStep.state, targetsDown, resetIn, run }, events };
}
