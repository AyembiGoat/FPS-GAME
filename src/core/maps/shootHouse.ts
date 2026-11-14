import type { EnemySpawn, GameMap, MapSolid, SurfaceMaterial } from '../map';

/*
 * Shoot House, expanded from 52 x 40 m to 62 x 52 m.
 *
 *                    north perimeter (z = -26)
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ North access road: flank corridor, timber posts, barriers     │
 *   ├──────────┬───────────────┬────────────────────┬─────────────┤
 *   │ West     │               │                    │             │
 *   │ breach   │  Central      │   Central yard     │  East lane  │
 *   │ house    │  yard         │   (container)      │  27 m lane  │
 *   │ (CQB)    │               │                    │             │
 *   ├──────────┴───────────────┴────────────────────┴─────────────┤
 *   │ South yard: spawn apron, crates and barriers                 │
 *   └──────────────────────────────────────────────────────────────┘
 *                    south perimeter (z = 26)
 *        west alley x -30..-27 runs the full west edge
 *
 * Routes: (1) south yard -> central yard -> east lane door; (2) south yard -> breach house
 * -> rear door -> north road; (3) south yard -> west alley -> north road -> east lane rear.
 * The house and yard both open onto the road, so no route is a dead end.
 *
 * Everything is an upright axis-aligned box: that is all `src/core/collision.ts` resolves.
 * Plywood walls stop short where they meet a perpendicular wall so no two faces are
 * coplanar, and every steel plate has 2 m of clear floor behind it to fall into.
 */

const PLY_HEIGHT = 2.6;
const PLY_HALF = 0.08;
const COPING_HALF = 0.1;
const COPING_HEIGHT = 0.09;
const PERIMETER_HEIGHT = 4.2;
const PERIMETER_THICK = 0.5;
const CRATE = 0.8;
const DOOR_TOP = 2.24;
const h = PLY_HALF;

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

/** Plywood wall running along X with a slightly wider timber coping (no coplanar faces). */
function plyX(z: number, x1: number, x2: number, height = PLY_HEIGHT): MapSolid[] {
  return [
    box(x1, 0, z - PLY_HALF, x2, height, z + PLY_HALF, 'plywood'),
    box(
      x1 - 0.01,
      height,
      z - COPING_HALF,
      x2 + 0.01,
      height + COPING_HEIGHT,
      z + COPING_HALF,
      'timber',
    ),
  ];
}

/** Plywood wall running along Z; coping stops short of intersecting X-wall coping. */
function plyZ(x: number, z1: number, z2: number, height = PLY_HEIGHT): MapSolid[] {
  return [
    box(x - PLY_HALF, 0, z1, x + PLY_HALF, height, z2, 'plywood'),
    box(
      x - COPING_HALF,
      height,
      z1 + 0.03,
      x + COPING_HALF,
      height + COPING_HEIGHT,
      z2 - 0.03,
      'timber',
    ),
  ];
}

/** Doorway header above head height, in a wall running along X. */
function lintelX(z: number, x1: number, x2: number): MapSolid {
  return box(x1, DOOR_TOP, z - 0.095, x2, PLY_HEIGHT + COPING_HEIGHT, z + 0.095, 'timber');
}

/** Doorway header above head height, in a wall running along Z. */
function lintelZ(x: number, z1: number, z2: number): MapSolid {
  return box(x - 0.095, DOOR_TOP, z1, x + 0.095, PLY_HEIGHT + COPING_HEIGHT, z2, 'timber');
}

/** Proud timber structural post at a wall junction or doorway. */
function post(x: number, z: number, height = PLY_HEIGHT + COPING_HEIGHT + 0.04): MapSolid {
  return box(x - 0.1, 0, z - 0.1, x + 0.1, height, z + 0.1, 'timber');
}

function crate(x: number, z: number, stack = 0): MapSolid {
  const half = CRATE / 2;
  const bottom = stack * CRATE;
  return box(x - half, bottom, z - half, x + half, bottom + CRATE, z + half, 'crate');
}

/** Low concrete jersey barrier: waist-high cover for leaning engagements. */
function barrier(x1: number, z1: number, x2: number, z2: number, height = 1.05): MapSolid {
  return box(x1, 0, z1, x2, height, z2, 'concrete');
}

const minX = -30;
const maxX = 32;
const minZ = -26;
const maxZ = 26;

/** Concrete pilasters lining the perimeter, giving the walls rhythm and shadow depth. */
const pilasters: MapSolid[] = [
  ...[-24, -16, -8, 0, 8, 16, 24].flatMap((x) => [
    box(x - 0.24, 0, minZ, x + 0.24, PERIMETER_HEIGHT + 0.05, minZ + 0.28, 'concrete'),
    box(x - 0.24, 0, maxZ - 0.28, x + 0.24, PERIMETER_HEIGHT + 0.05, maxZ, 'concrete'),
  ]),
  ...[-18, -10, -2, 6, 14, 22].flatMap((z) => [
    box(minX, 0, z - 0.24, minX + 0.28, PERIMETER_HEIGHT + 0.05, z + 0.24, 'concrete'),
    box(maxX - 0.28, 0, z - 0.24, maxX, PERIMETER_HEIGHT + 0.05, z + 0.24, 'concrete'),
  ]),
];

/** Overhead timber pergola over the breach house, well above jump apex. */
const breachRafters: MapSolid[] = [-15, -12, -9, -6, -3, 0, 3, 6].map((z) =>
  box(-27.2, 3.0, z - 0.09, -13.8, 3.17, z + 0.09, 'timber'),
);

/** Overhead ballistic baffles across the east lane, carried on grounded timber portals. */
const laneBaffles: MapSolid[] = [5, -2, -9].flatMap((z) => [
  box(14.2, 3.18, z - 0.14, 31.9, 3.84, z + 0.14, 'timber'),
  box(14.2, 0, z - 0.14, 14.56, 3.18, z + 0.14, 'timber'),
  box(31.54, 0, z - 0.14, 31.9, 3.18, z + 0.14, 'timber'),
]);

/** Timber post row marking the north access road, one of the map's landmarks. */
const roadPosts: MapSolid[] = [-24, -18, -12, -6, 0, 6, 12, 18, 24, 30].map((x) =>
  post(x, -18.4, 2.73),
);

/**
 * Six hostile start positions, spread across the compound: two in the breach house, two in
 * the central yard, one down the east lane and one on the north road. None is in the south
 * yard, so a run never opens with an enemy behind the player.
 */
const enemySpawns: readonly EnemySpawn[] = [
  { position: { x: -17.6, y: 0, z: 4.2 }, yaw: Math.PI },
  { position: { x: -23.8, y: 0, z: -13.2 }, yaw: Math.PI * 0.82 },
  { position: { x: 9.2, y: 0, z: -6.4 }, yaw: Math.PI * 1.08 },
  { position: { x: -7.2, y: 0, z: -14.4 }, yaw: Math.PI * 0.8 },
  { position: { x: 21.0, y: 0, z: -8.2 }, yaw: Math.PI },
  { position: { x: 27.4, y: 0, z: -20.6 }, yaw: Math.PI * 0.92 },
];

export const shootHouse: GameMap = {
  name: 'Shoot House',
  bounds: { minX, maxX, minZ, maxZ },
  spawn: { position: { x: 0, y: 0, z: 22 }, yaw: 0 },
  solids: [
    // Floor slab.
    box(minX, -1, minZ, maxX, 0, maxZ, 'floor'),

    // Perimeter concrete compound walls.
    box(
      minX - PERIMETER_THICK,
      0,
      minZ - PERIMETER_THICK,
      maxX + PERIMETER_THICK,
      PERIMETER_HEIGHT,
      minZ,
      'concrete',
    ),
    box(
      minX - PERIMETER_THICK,
      0,
      maxZ,
      maxX + PERIMETER_THICK,
      PERIMETER_HEIGHT,
      maxZ + PERIMETER_THICK,
      'concrete',
    ),
    box(minX - PERIMETER_THICK, 0, minZ, minX, PERIMETER_HEIGHT, maxZ, 'concrete'),
    box(maxX, 0, minZ, maxX + PERIMETER_THICK, PERIMETER_HEIGHT, maxZ, 'concrete'),
    ...pilasters,

    // === WEST BREACH HOUSE (x -27..-14, z -17..10), four rooms, four doors ===
    // South wall: 2 m entry door into the south-east room.
    ...plyX(10, -27, -21),
    ...plyX(10, -19, -14),
    lintelX(10, -21, -19),
    // North wall: 2 m rear door onto the north access road.
    ...plyX(-17, -27, -22),
    ...plyX(-17, -20, -14),
    lintelX(-17, -22, -20),
    // West wall: 2 m breach door onto the west alley.
    ...plyZ(-27, -17 + h, -8),
    ...plyZ(-27, -6, 10 - h),
    lintelZ(-27, -8, -6),
    // East wall: two 2 m doors facing the central yard.
    ...plyZ(-14, -17 + h, -6),
    ...plyZ(-14, -4, 4),
    ...plyZ(-14, 6, 10 - h),
    lintelZ(-14, -6, -4),
    lintelZ(-14, 4, 6),
    // Interior divider x = -21, splitting the house into east and west rooms.
    ...plyZ(-21, -17 + h, -12),
    ...plyZ(-21, -10, 2),
    ...plyZ(-21, 4, 10 - h),
    lintelZ(-21, -12, -10),
    lintelZ(-21, 2, 4),
    // West rooms split at z = -2; east rooms split at z = -4, offset for a staggered route.
    ...plyX(-2, -27 + h, -24),
    ...plyX(-2, -22, -21 - h),
    lintelX(-2, -24, -22),
    ...plyX(-4, -21 + h, -18),
    ...plyX(-4, -16, -14 - h),
    lintelX(-4, -18, -16),
    // Room furniture: a concrete barrier and two crates for cover inside the house.
    barrier(-18.8, 0.8, -16.0, 1.35),
    crate(-25.2, 2.4),
    crate(-24.4, -8.6),
    crate(-19.4, -8.2),
    // Structural corner posts and the pergola over the house.
    post(-27, 10),
    post(-14, 10),
    post(-27, -17),
    post(-14, -17),
    post(-21, -2),
    post(-21, -4),
    ...breachRafters,

    // === CENTRAL YARD (x -14..14, z -17..10) ===
    // 20-ft corrugated steel shipping container: the central landmark and full-height cover.
    box(2.0, 0, -5.0, 4.6, 2.6, 1.2, 'container'),
    // Staggered shoot-walls and jersey barriers.
    ...plyX(-6.0, -10.5, -5.5),
    post(-10.5, -6.0),
    post(-5.5, -6.0),
    barrier(-3.6, 4.6, -0.4, 5.15),
    barrier(-12.4, -12.8, -9.4, -12.25),
    barrier(10.0, 4.6, 12.6, 5.15),
    // Full-height shoot-wall on the east side of the yard, breaking the spawn sightline.
    ...plyX(2.2, 5.2, 8.4),
    post(5.2, 2.2),
    post(8.4, 2.2),
    // Mid-yard crates: jumpable cover, one stacked to break the sightline.
    crate(-12.6, 4.2),
    crate(-12.6, 4.2, 1),
    crate(0.2, 6.4),
    crate(-2.4, -9.6),
    crate(11.4, -11.4),
    crate(11.4, -11.4, 1),
    // South edge: partial wall that hides most of the yard from the spawn apron.
    ...plyX(10, -14, -8.2),
    post(-14, 10),
    post(-8.2, 10),
    // North wall onto the access road, with a 4 m opening at x 3..7.
    ...plyX(-17, -14, 3),
    ...plyX(-17, 7, 14),
    post(3, -17),
    post(7, -17),
    // East wall dividing the yard from the long lane, with a 2 m door at z -3..-1.
    ...plyZ(14, -17 + h, -3),
    ...plyZ(14, -1, 10 - h),
    lintelZ(14, -3, -1),
    post(14, -3),
    post(14, -1),
    post(14, 10),

    // === EAST LANE (x 14..32, z -17..10): 27 m of open sightline, extended to 39 m
    // through the north road gap at x 22..25. ===
    // North wall onto the road with a 3 m opening at x 22..25.
    ...plyX(-17, 14, 22),
    ...plyX(-17, 25, 32),
    post(22, -17),
    post(25, -17),
    // Concrete shooting bench at the south end and side baffles that stagger the lane.
    barrier(16.2, 7.4, 22.4, 8.1, 1.02),
    ...plyX(2.0, 26.4, 31.9, 2.4),
    post(26.4, 2.0, 2.54),
    ...plyX(-9.0, 14.2, 19.6, 2.4),
    post(19.6, -9.0, 2.54),
    crate(29.4, 6.4),
    crate(15.4, -14.4),
    ...laneBaffles,

    // === NORTH ACCESS ROAD (z -26..-17) ===
    // Low concrete barriers and a plywood screen give the road cover without closing it.
    barrier(-11.0, -22.4, -6.6, -21.85),
    barrier(6.4, -23.4, 10.8, -22.85),
    ...plyX(-20.0, 8.0, 14.0),
    post(8.0, -20.0),
    post(14.0, -20.0),
    crate(-2.2, -23.0),
    crate(19.0, -20.2),
    ...roadPosts,

    // === SOUTH YARD (z 10..26): spawn apron ===
    // Cover that breaks the run from spawn without blocking the exits.
    barrier(4.4, 16.0, 7.6, 16.55),
    barrier(-12.6, 18.4, -9.4, 18.95),
    crate(-8.6, 13.6),
    crate(11.6, 13.4),
    crate(11.6, 13.4, 1),
    crate(-2.0, 19.4),
    post(-14, 10.2),
    post(14, 10.2),
  ],
  targets: [
    // Breach house: five close-range plates across the four rooms.
    { position: { x: -17.0, y: 0, z: 8.4 }, facing: { x: 0, z: 1 } },
    { position: { x: -24.4, y: 0, z: 6.0 }, facing: { x: 1, z: 0 } },
    { position: { x: -22.0, y: 0, z: -9.0 }, facing: { x: 0, z: 1 } },
    { position: { x: -17.4, y: 0, z: -12.4 }, facing: { x: 0, z: -1 } },
    { position: { x: -15.6, y: 0, z: -1.0 }, facing: { x: 1, z: 0 } },

    // Central yard: five mid-range plates.
    { position: { x: -10.0, y: 0, z: 6.6 }, facing: { x: 1, z: 0 } },
    { position: { x: -6.2, y: 0, z: -9.0 }, facing: { x: 0, z: 1 } },
    { position: { x: 6.6, y: 0, z: -12.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 10.6, y: 0, z: 3.4 }, facing: { x: -1, z: 0 } },
    { position: { x: 0.0, y: 0, z: -14.6 }, facing: { x: 0, z: 1 } },

    // East lane: four plates down the long sightline.
    { position: { x: 18.0, y: 0, z: 2.0 }, facing: { x: 0, z: 1 } },
    { position: { x: 27.0, y: 0, z: -3.0 }, facing: { x: 0, z: 1 } },
    { position: { x: 19.4, y: 0, z: -12.0 }, facing: { x: 0, z: 1 } },
    { position: { x: 28.4, y: 0, z: -14.0 }, facing: { x: 0, z: 1 } },
  ],
  enemySpawns,
};
