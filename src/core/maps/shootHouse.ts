import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

const PLY_HEIGHT = 2.6;
const PLY_HALF = 0.08;
const COPING_HALF = 0.1;
const COPING_HEIGHT = 0.09;
const PERIMETER_HEIGHT = 4.2;
const PERIMETER_THICK = 0.5;
const CRATE = 0.8;
const DOOR_TOP = 2.24;

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

/** Plywood wall running along X with a slightly wider dark timber top coping beam (no coplanar faces). */
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

/** Plywood wall running along Z; coping stops short of intersecting X-wall coping to prevent Z-fighting. */
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

/** Structural timber doorway header spanning an X-axis wall opening above head height. */
function lintelX(z: number, x1: number, x2: number): MapSolid {
  return box(x1, DOOR_TOP, z - 0.095, x2, PLY_HEIGHT + COPING_HEIGHT, z + 0.095, 'timber');
}

/** Structural timber doorway header spanning a Z-axis wall opening above head height. */
function lintelZ(x: number, z1: number, z2: number): MapSolid {
  return box(x - 0.095, DOOR_TOP, z1, x + 0.095, PLY_HEIGHT + COPING_HEIGHT, z2, 'timber');
}

/** Proud timber structural post placed at major wall junctions and corners. */
function post(x: number, z: number, height = PLY_HEIGHT + COPING_HEIGHT + 0.04): MapSolid {
  return box(x - 0.1, 0, z - 0.1, x + 0.1, height, z + 0.1, 'timber');
}

function crate(x: number, z: number, stack = 0): MapSolid {
  const half = CRATE / 2;
  const bottom = stack * CRATE;
  return box(x - half, bottom, z - half, x + half, bottom + CRATE, z + half, 'crate');
}

/** Low concrete jersey barrier for waist-high cover and leaning engagements. */
function barrier(x1: number, z1: number, x2: number, z2: number, height = 1.05): MapSolid {
  return box(x1, 0, z1, x2, height, z2, 'concrete');
}

const minX = -26;
const maxX = 26;
const minZ = -20;
const maxZ = 20;
const h = PLY_HALF;

// Concrete structural pilasters lining the perimeter walls for architectural rhythm and shadow depth.
const pilasters: MapSolid[] = [
  ...[-18, -9, 0, 9].flatMap((x) => [
    box(x - 0.24, 0, minZ, x + 0.24, PERIMETER_HEIGHT + 0.05, minZ + 0.28, 'concrete'),
    box(x - 0.24, 0, maxZ - 0.28, x + 0.24, PERIMETER_HEIGHT + 0.05, maxZ, 'concrete'),
  ]),
  ...[-12, -4, 4, 12].flatMap((z) => [
    box(minX, 0, z - 0.24, minX + 0.28, PERIMETER_HEIGHT + 0.05, z + 0.24, 'concrete'),
    box(maxX - 0.28, 0, z - 0.24, maxX, PERIMETER_HEIGHT + 0.05, z + 0.24, 'concrete'),
  ]),
];

// Overhead timber pergola rafters above the West Breach House (well above jump apex).
const breachRafters: MapSolid[] = [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5].map((z) =>
  box(-22.0, 2.95, z - 0.09, -9.0, 3.12, z + 0.09, 'timber'),
);

// Overhead ballistic baffles across the East Long-Range Firing Lane, supported by grounded
// floor-to-beam structural timber portal columns on both sides of the bay.
const rangeBaffles: MapSolid[] = [5.5, -4.0, -11.5].flatMap((z) => [
  box(11.68, 3.18, z - 0.14, 25.98, 3.84, z + 0.14, 'timber'),
  box(11.68, 0, z - 0.14, 12.04, 3.18, z + 0.14, 'timber'),
  box(25.66, 0, z - 0.14, 25.98, 3.18, z + 0.14, 'timber'),
]);

/**
 * Three-zone tactical training compound (52 m × 40 m):
 * - West: CQB Breach House with interconnected rooms, framed doorways, and overhead pergola.
 * - Centre: Tactical Yard with corrugated shipping container, jersey barriers, crates, and shoot-walls.
 * - East: 38 m baffled Long-Range Overwatch Bay tuned for high-zoom rifles and bolt-action snipers.
 *
 * Every plywood wall stops short where it meets a perpendicular wall so no coplanar faces
 * Z-fight, and every target has >= 2.4 m of clear floor behind it for clean hinge knockdown.
 */
export const shootHouse: GameMap = {
  name: 'Shoot House',
  bounds: { minX, maxX, minZ, maxZ },
  spawn: { position: { x: -0.5, y: 0, z: 17.4 }, yaw: 0 },
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

    // === ZONE 1: WEST CQB BREACH HOUSE (x: -22..-9, z: -13..7) ===
    // South wall with 2.0 m framed breach doorway.
    ...plyX(7, -22, -16.2),
    ...plyX(7, -14.2, -9),
    lintelX(7, -16.2, -14.2),
    // North wall with 2.0 m framed rear exit.
    ...plyX(-13, -22, -16.2),
    ...plyX(-13, -14.2, -9),
    lintelX(-13, -16.2, -14.2),
    // West wall with 2.0 m flank doorway.
    ...plyZ(-22, -13 + h, -3.4),
    ...plyZ(-22, -1.4, 7 - h),
    lintelZ(-22, -3.4, -1.4),
    // East wall facing central yard with two 2.0 m framed doorways.
    ...plyZ(-9, -13 + h, -8.8),
    ...plyZ(-9, -6.8, 1.2),
    ...plyZ(-9, 3.2, 7 - h),
    lintelZ(-9, -8.8, -6.8),
    lintelZ(-9, 1.2, 3.2),
    // Interior breach house dividers (4 tactical rooms + lean-peek corners).
    ...plyX(-3, -22 + h, -15.2),
    ...plyX(-3, -12.6, -9 - h),
    ...plyZ(-15.2, -13 + h, -6.2),
    // SW room waist-high concrete barrier.
    barrier(-20.2, 2.2, -17.4, 2.65),
    // Structural corner posts & overhead timber rafters.
    post(-22, 7),
    post(-9, 7),
    post(-22, -13),
    post(-9, -13),
    ...breachRafters,

    // === ZONE 2: CENTRAL TACTICAL YARD (x: -9..11.8, z: -20..20) ===
    // 20-ft corrugated steel shipping container landmark.
    box(2.0, 0, -4.8, 4.6, 2.6, 1.4, 'container'),
    // Low concrete jersey barriers for mid-range leans and cover.
    barrier(-4.6, 6.4, -1.4, 6.9),
    barrier(-2.2, -9.2, 1.0, -8.7),
    // Mid-yard staggered plywood shoot-walls.
    ...plyX(-4.2, -6.2, -2.6),
    post(-6.2, -4.2),
    post(-2.6, -4.2),
    // North-east corner bunker.
    ...plyX(-12.6, 1.6, 8.2),
    ...plyZ(8.2, -12.6 + h, -7.0),
    post(1.6, -12.6),
    post(8.2, -12.6),
    post(8.2, -7.0),
    // Jumpable wooden supply crates (single 0.8 m and stacked 1.6 m).
    crate(-5.0, 11.4),
    crate(-5.0, 11.4, 1),
    crate(6.8, 9.6),
    crate(-0.6, 1.4),
    crate(0.8, -6.0),
    crate(8.4, -1.6),
    crate(8.4, -1.6, 1),
    crate(-6.5, -15.8),

    // === ZONE 3: EAST LONG-RANGE OVERWATCH LANE (x: 11.8..26, z: -20..20) ===
    // Dividing range wall separating Central Yard from the 38 m Firing Lane.
    ...plyZ(11.8, -15.0, -3.4),
    ...plyZ(11.8, -1.4, 12.6),
    lintelZ(11.8, -3.4, -1.4),
    post(11.8, -15.0),
    post(11.8, 12.6),
    // South concrete shooting bench + elevated vantage crates.
    barrier(15.2, 12.6, 21.2, 13.3, 1.02),
    crate(22.8, 15.8),
    crate(23.6, 15.8),
    // Staggered side range baffles preserving a 38 m sniper corridor down x: 15.5..22.5.
    ...plyX(3.5, 22.8, 25.6, 2.4),
    post(22.8, 3.5, 2.54),
    ...plyX(-6.5, 11.8 + h, 14.8, 2.4),
    post(14.8, -6.5, 2.54),
    ...rangeBaffles,
  ],
  targets: [
    // Zone 1 — West CQB Breach House (5 close-quarters targets).
    { position: { x: -19.2, y: 0, z: 4.6 }, facing: { x: 1, z: 0 } },
    { position: { x: -11.4, y: 0, z: 4.6 }, facing: { x: -1, z: 0 } },
    { position: { x: -18.6, y: 0, z: -10.2 }, facing: { x: 0, z: 1 } },
    { position: { x: -12.0, y: 0, z: -10.2 }, facing: { x: 0, z: 1 } },
    { position: { x: -24.0, y: 0, z: -14.5 }, facing: { x: 0, z: 1 } },

    // Zone 2 — Central Tactical Yard (5 mid-range targets).
    { position: { x: -4.4, y: 0, z: -16.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 4.8, y: 0, z: -16.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 4.8, y: 0, z: -9.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 9.0, y: 0, z: 4.2 }, facing: { x: -1, z: 0 } },
    { position: { x: -6.6, y: 0, z: 12.2 }, facing: { x: 1, z: 0 } },

    // Zone 3 — East Long-Range Sniper Lane (4 targets at ~15 m, ~26 m, and ~36 m).
    { position: { x: 15.0, y: 0, z: -1.6 }, facing: { x: 0, z: 1 } },
    { position: { x: 22.2, y: 0, z: -11.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 16.0, y: 0, z: -17.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 22.4, y: 0, z: -17.2 }, facing: { x: 0, z: 1 } },
  ],
};
