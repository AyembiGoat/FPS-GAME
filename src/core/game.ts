import type { Box } from './collision';
import { raycast } from './collision';
import type { GameMap, SurfaceMaterial, TargetSpawn } from './map';
import type { PlayerInput, PlayerState } from './player';
import { createPlayer, eyePosition, stepPlayer } from './player';
import type { Vec3 } from './vec';
import { add, scale } from './vec';
import type { WeaponInput, WeaponSpec, WeaponState } from './weapon';
import { createWeapon, M1911, stepWeapon } from './weapon';

export type GameInput = PlayerInput & WeaponInput;

/** The weapon the player carries. There is only one so far. */
export const WEAPON: WeaponSpec = M1911;

export interface GameState {
  readonly player: PlayerState;
  readonly weapon: WeaponState;
  /** True for each target that has been knocked down. */
  readonly targetsDown: readonly boolean[];
  /** Seconds until the targets stand back up; 0 while any is still standing. */
  readonly resetIn: number;
}

export type GameEvent =
  | {
      readonly type: 'shot';
      readonly origin: Vec3;
      readonly direction: Vec3;
      readonly hit: {
        readonly point: Vec3;
        readonly normal: Vec3;
        readonly distance: number;
        readonly surface: SurfaceMaterial | 'target';
      } | null;
    }
  | { readonly type: 'target-down'; readonly index: number; readonly distance: number }
  | { readonly type: 'targets-reset' }
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

export function createGame(map: GameMap): GameState {
  return {
    player: createPlayer(map.spawn.position, map.spawn.yaw),
    weapon: createWeapon(WEAPON),
    targetsDown: map.targets.map(() => false),
    resetIn: 0,
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

  if (resetIn > 0) {
    resetIn = Math.max(0, resetIn - dt);
    if (resetIn === 0) {
      targetsDown = targetsDown.map(() => false);
      events.push({ type: 'targets-reset' });
    }
  }

  const standing = map.targets.filter((_, index) => !targetsDown[index]);
  const solids: Box[] = [...map.solids, ...standing.map(targetBlocker)];
  const playerStep = stepPlayer(state.player, input, dt, solids);
  const player = playerStep.state;
  if (playerStep.jumped) events.push({ type: 'jump' });
  if (playerStep.landedSpeed !== null) events.push({ type: 'land', speed: playerStep.landedSpeed });

  const weaponStep = stepWeapon(state.weapon, input, dt, WEAPON);
  for (const event of weaponStep.events) {
    if (event !== 'shot') {
      events.push({ type: event });
      continue;
    }

    // Fire from the eye, wherever leaning has put it, along the aim as it was before
    // this shot's own kick.
    const origin = eyePosition(player);
    const direction = aimDirection(player.yaw, player.pitch + state.weapon.recoil);

    // Hit boxes go after the map solids so an index tells us which kind was hit.
    const targetIndexes = map.targets.flatMap((_, index) =>
      targetsDown[index] ? [] : [index, index],
    );
    const targetBoxes = map.targets.flatMap((spawn, index) =>
      targetsDown[index] ? [] : targetHitBoxes(spawn),
    );
    const hit = raycast(origin, direction, WEAPON.range, [...map.solids, ...targetBoxes]);

    if (!hit) {
      events.push({ type: 'shot', origin, direction, hit: null });
      continue;
    }

    const mapSolid = map.solids[hit.index];
    const point = add(origin, scale(direction, hit.distance));
    events.push({
      type: 'shot',
      origin,
      direction,
      hit: {
        point,
        normal: hit.normal,
        distance: hit.distance,
        surface: mapSolid ? mapSolid.material : 'target',
      },
    });

    const targetIndex = targetIndexes[hit.index - map.solids.length];
    if (targetIndex !== undefined) {
      targetsDown = targetsDown.map((down, index) => down || index === targetIndex);
      events.push({ type: 'target-down', index: targetIndex, distance: hit.distance });
      if (targetsDown.every(Boolean)) resetIn = TARGET.resetDelay;
    }
  }

  return { state: { player, weapon: weaponStep.state, targetsDown, resetIn }, events };
}
