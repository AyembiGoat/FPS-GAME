import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

/**
 * Shoot House: an open-top training yard, 32 m by 24 m. A concrete perimeter wall
 * encloses two plywood buildings either side of a central lane, with free-standing
 * barricades in the lane and an alley running round the back.
 * Built from reference/shoot-house.png.
 */

const PERIMETER_HEIGHT = 3.6;
const PLY_HEIGHT = 2.4;
const PLY_HALF = 0.06;
const DOOR_TOP = 2.05;
const CRATE = 0.8;

function box(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  material: SurfaceMaterial,
): MapSolid {
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ }, material };
}

/** Plywood wall along X at `z`, with an optional doorway `[from, to]`. */
function plyX(z: number, x1: number, x2: number, door?: readonly [number, number]): MapSolid[] {
  const wall = (a: number, b: number, y1 = 0, y2 = PLY_HEIGHT) =>
    box(a, y1, z - PLY_HALF, b, y2, z + PLY_HALF, 'plywood');
  if (!door) return [wall(x1, x2)];
  return [wall(x1, door[0]), wall(door[1], x2), wall(door[0], door[1], DOOR_TOP)];
}

/** Plywood wall along Z at `x`, with an optional doorway `[from, to]`. */
function plyZ(x: number, z1: number, z2: number, door?: readonly [number, number]): MapSolid[] {
  const wall = (a: number, b: number, y1 = 0, y2 = PLY_HEIGHT) =>
    box(x - PLY_HALF, y1, a, x + PLY_HALF, y2, b, 'plywood');
  if (!door) return [wall(z1, z2)];
  return [wall(z1, door[0]), wall(door[1], z2), wall(door[0], door[1], DOOR_TOP)];
}

function crate(x: number, z: number, level = 0): MapSolid {
  const half = CRATE / 2;
  return box(x - half, level * CRATE, z - half, x + half, (level + 1) * CRATE, z + half, 'crate');
}

// Walls along X run the full length including corners; walls along Z stop short of
// them, so no two faces are ever coplanar.
const h = PLY_HALF;

export const shootHouse: GameMap = {
  name: 'Shoot House',
  bounds: { minX: -16, maxX: 16, minZ: -12, maxZ: 12 },
  spawn: { position: { x: 0, y: 0, z: 10.5 }, yaw: 0 },
  solids: [
    box(-16.4, -0.5, -12.4, 16.4, 0, 12.4, 'floor'),

    box(-16.4, 0, -12.4, 16.4, PERIMETER_HEIGHT, -12, 'concrete'),
    box(-16.4, 0, 12, 16.4, PERIMETER_HEIGHT, 12.4, 'concrete'),
    box(-16.4, 0, -12, -16, PERIMETER_HEIGHT, 12, 'concrete'),
    box(16, 0, -12, 16.4, PERIMETER_HEIGHT, 12, 'concrete'),

    // West building: x -13..-5, z -8..3. Three rooms.
    ...plyX(3, -13 - h, -5 + h, [-9.6, -8.4]),
    ...plyX(-8, -13 - h, -5 + h),
    ...plyZ(-13, -8 + h, 3 - h),
    ...plyZ(-5, -8 + h, 3 - h, [-3.6, -2.4]),
    ...plyX(-2, -13 + h, -8.5),
    ...plyZ(-9, -8 + h, -5.2),

    // East building: x 5..13, z -8..3. Three rooms.
    ...plyX(3, 5 - h, 13 + h, [8.4, 9.6]),
    ...plyX(-8, 5 - h, 13 + h),
    ...plyZ(13, -8 + h, 3 - h),
    ...plyZ(5, -8 + h, 3 - h, [-5.6, -4.4]),
    ...plyZ(9, -8 + h, -2.5),
    ...plyX(-1, 10.5, 13 - h),

    // Barricades in the lane. They hide the far target from the spawn.
    ...plyX(-3.5, -2.2, 0.2),
    ...plyX(-7.5, -0.2, 2.4),

    crate(-1.6, 6.5),
    crate(-1.6, 6.5, 1),
    crate(3.2, 5.4),
    crate(1.4, -5.2),
    crate(-3.6, -10),
    crate(-7, 0.6),
    crate(11.4, -0.2),
    crate(14.6, 4),
    crate(14.6, 4, 1),
  ],
  // Each target has at least 1.9 m of clear floor behind it to fall onto.
  targets: [
    { position: { x: 0, y: 0, z: -9.8 }, facing: { x: 0, z: 1 } },
    { position: { x: -10.8, y: 0, z: 1 }, facing: { x: 1, z: 0 } },
    { position: { x: -11, y: 0, z: -5.5 }, facing: { x: 0, z: 1 } },
    { position: { x: -7, y: 0, z: -5.5 }, facing: { x: 0, z: 1 } },
    { position: { x: 10.8, y: 0, z: 1.4 }, facing: { x: -1, z: 0 } },
    { position: { x: 11, y: 0, z: -5.5 }, facing: { x: 0, z: 1 } },
    { position: { x: 7, y: 0, z: -5.5 }, facing: { x: 0, z: 1 } },
    { position: { x: -14.5, y: 0, z: -9.5 }, facing: { x: 0, z: 1 } },
    { position: { x: 10, y: 0, z: -10 }, facing: { x: -1, z: 0 } },
    { position: { x: 14.5, y: 0, z: -3 }, facing: { x: 0, z: 1 } },
  ],
};
