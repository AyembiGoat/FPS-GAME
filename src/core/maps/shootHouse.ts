import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

/**
 * Shoot House: an open-top training yard. A concrete perimeter wall encloses two
 * plywood buildings either side of a central lane. Built from reference/shoot-house.png.
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
  bounds: { minX: -12, maxX: 12, minZ: -9, maxZ: 9 },
  spawn: { position: { x: 0, y: 0, z: 7.5 }, yaw: 0 },
  solids: [
    box(-12.4, -0.5, -9.4, 12.4, 0, 9.4, 'floor'),

    box(-12.4, 0, -9.4, 12.4, PERIMETER_HEIGHT, -9, 'concrete'),
    box(-12.4, 0, 9, 12.4, PERIMETER_HEIGHT, 9.4, 'concrete'),
    box(-12.4, 0, -9, -12, PERIMETER_HEIGHT, 9, 'concrete'),
    box(12, 0, -9, 12.4, PERIMETER_HEIGHT, 9, 'concrete'),

    // West building: x -10..-3.5, z -6..3.
    ...plyX(3, -10 - h, -3.5 + h, [-7.4, -6.2]),
    ...plyX(-6, -10 - h, -3.5 + h),
    ...plyZ(-10, -6 + h, 3 - h),
    ...plyZ(-3.5, -6 + h, 3 - h, [-2.6, -1.4]),
    ...plyX(-1, -10 + h, -6.5),

    // East building: x 3.5..10, z -6..3.
    ...plyX(3, 3.5 - h, 10 + h, [6.2, 7.4]),
    ...plyX(-6, 3.5 - h, 10 + h),
    ...plyZ(10, -6 + h, 3 - h),
    ...plyZ(3.5, -6 + h, 3 - h, [-4.4, -3.2]),
    ...plyZ(6.8, -6 + h, -1.5),

    crate(0, -2),
    crate(-1.6, 5),
    crate(-1.6, 5, 1),
    crate(3.2, 4.6),
    crate(8.6, 0.2),
  ],
  // Each target has at least 1.9 m of clear floor behind it to fall onto.
  targets: [
    { position: { x: 0, y: 0, z: -7 }, facing: { x: 0, z: 1 } },
    { position: { x: -8, y: 0, z: 1 }, facing: { x: 1, z: 0 } },
    { position: { x: -8.5, y: 0, z: -4 }, facing: { x: 0, z: 1 } },
    { position: { x: -4.6, y: 0, z: -4 }, facing: { x: 0, z: 1 } },
    { position: { x: 8, y: 0, z: 1.6 }, facing: { x: -1, z: 0 } },
    { position: { x: 8.6, y: 0, z: -4 }, facing: { x: 0, z: 1 } },
    { position: { x: 5, y: 0, z: -4 }, facing: { x: 0, z: 1 } },
    { position: { x: -11, y: 0, z: -7 }, facing: { x: 0, z: 1 } },
  ],
};
