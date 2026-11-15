import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

/**
 * Test fixture, not a playable level: a bare firing lane with damageable dummies.
 *
 * It exists so the damage model, armour, healing HUD and aimed health readout can be exercised by
 * unit tests and the playtest script. It is not in `MAP_LIST`, `isMapId` rejects its id, and no
 * menu offers it.
 */

function box(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  material: SurfaceMaterial,
): MapSolid {
  return {
    min: { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) },
    max: { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) },
    material,
  };
}

const HALF_WIDTH = 7;
const NORTH = -62;
const SOUTH = 4;
const WALL = 0.5;
const WALL_HEIGHT = 4;
const FACING_SOUTH = { x: 0, z: 1 } as const;

/** Indexes into `testDummyRange.targets`, so tests never rely on bare numbers. */
export const TEST_DUMMY = {
  /** 100 HP, no armour, 10 m. */
  bare: 0,
  /** 100 HP, level 1 vest and helmet, 10 m. */
  level1: 1,
  /** 100 HP, level 2 vest and helmet, 10 m. */
  level2: 2,
  /** 100 HP, level 3 vest and helmet, 10 m. */
  level3: 3,
  /** 100 HP, no armour, 50 m: far enough for damage falloff. */
  far: 4,
  /** Plain steel plate that drops to any hit, 10 m. */
  steel: 5,
} as const;

export const testDummyRange: GameMap = {
  id: 'test-dummy-range',
  name: 'Dummy Range',
  subtitle: 'TEST FIXTURE',
  summary: 'Bare lane with damageable dummies. Used by tests only.',
  locationTag: 'TEST',
  sectors: ['Lane'],
  bounds: { minX: -HALF_WIDTH, maxX: HALF_WIDTH, minZ: NORTH, maxZ: SOUTH },
  spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
  solids: [
    box(-HALF_WIDTH - WALL, -1, NORTH - WALL, HALF_WIDTH + WALL, 0, SOUTH + WALL, 'concrete'),
    box(-HALF_WIDTH - WALL, 0, NORTH - WALL, HALF_WIDTH + WALL, WALL_HEIGHT, NORTH, 'concrete'),
    box(-HALF_WIDTH - WALL, 0, SOUTH, HALF_WIDTH + WALL, WALL_HEIGHT, SOUTH + WALL, 'concrete'),
    box(-HALF_WIDTH - WALL, 0, NORTH, -HALF_WIDTH, WALL_HEIGHT, SOUTH, 'concrete'),
    box(HALF_WIDTH, 0, NORTH, HALF_WIDTH + WALL, WALL_HEIGHT, SOUTH, 'concrete'),
  ],
  targets: [
    { position: { x: 0, y: 0, z: -10 }, facing: FACING_SOUTH, health: 100 },
    { position: { x: -1.5, y: 0, z: -10 }, facing: FACING_SOUTH, health: 100, vest: 1, helmet: 1 },
    { position: { x: -3, y: 0, z: -10 }, facing: FACING_SOUTH, health: 100, vest: 2, helmet: 2 },
    { position: { x: -4.5, y: 0, z: -10 }, facing: FACING_SOUTH, health: 100, vest: 3, helmet: 3 },
    { position: { x: 1.5, y: 0, z: -50 }, facing: FACING_SOUTH, health: 100 },
    { position: { x: 3, y: 0, z: -10 }, facing: FACING_SOUTH },
  ],
  enemies: [],
};
