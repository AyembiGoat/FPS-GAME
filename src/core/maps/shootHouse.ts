import type { LootItem, LootSpawn } from '../loot';
import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

const PLY_HEIGHT = 2.65;
const PLY_HALF = 0.08;
const COPING_HALF = 0.1;
const COPING_HEIGHT = 0.09;
const PERIMETER_HEIGHT = 4.65;
const PERIMETER_THICK = 0.55;
const CRATE = 0.8;
const DOOR_TOP = 2.26;

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

/** An item resting on top of the single crate centred at `(x, z)`. */
function onCrate(id: string, x: number, z: number, item: LootItem): LootSpawn {
  return { id, item, position: { x, y: CRATE, z } };
}

/** Low concrete jersey barrier for waist-high cover and leaning engagements. */
function barrier(x1: number, z1: number, x2: number, z2: number, height = 1.08): MapSolid {
  return box(x1, 0, z1, x2, height, z2, 'concrete');
}

const minX = -35;
const maxX = 35;
const minZ = -28;
const maxZ = 28;
const h = PLY_HALF;

// Concrete structural pilasters lining the 70 m × 56 m perimeter walls for architectural rhythm.
const pilasters: MapSolid[] = [
  ...[-27, -18, -9, 0, 9, 18, 27].flatMap((x) => [
    box(x - 0.26, 0, minZ, x + 0.26, PERIMETER_HEIGHT + 0.05, minZ + 0.3, 'concrete'),
    box(x - 0.26, 0, maxZ - 0.3, x + 0.26, PERIMETER_HEIGHT + 0.05, maxZ, 'concrete'),
  ]),
  ...[-21, -13, -5, 3, 11, 19].flatMap((z) => [
    box(minX, 0, z - 0.26, minX + 0.3, PERIMETER_HEIGHT + 0.05, z + 0.26, 'concrete'),
    box(maxX - 0.3, 0, z - 0.26, maxX, PERIMETER_HEIGHT + 0.05, z + 0.26, 'concrete'),
  ]),
];

// Overhead timber pergola rafters above the West CQB Breach House.
const breachRafters: MapSolid[] = [-11, -7.5, -4, -0.5, 3, 6.5, 10].map((z) =>
  box(-29.5, 3.05, z - 0.09, -12.0, 3.22, z + 0.09, 'timber'),
);

// Overhead timber rafters above the North Command Annex.
const commandRafters: MapSolid[] = [-9, -5.5, -2, 1.5, 5, 8.5].map((x) =>
  box(x - 0.09, 3.08, -25.0, x + 0.09, 3.25, -16.0, 'timber'),
);

// Overhead steel-and-timber ballistic baffles across the 50 m East Marksman Alley.
const rangeBaffles: MapSolid[] = [8.0, -3.5, -15.0].flatMap((z) => [
  box(13.68, 3.28, z - 0.14, 34.96, 3.96, z + 0.14, 'timber'),
  box(13.68, 0, z - 0.14, 14.04, 3.28, z + 0.14, 'steel'),
  box(34.6, 0, z - 0.14, 34.96, 3.28, z + 0.14, 'steel'),
]);

/**
 * Overhauled Shoot House (70 m × 56 m):
 * Five-sector arid military live-fire compound featuring timber-framed CQB plywood breach rooms,
 * dual maritime & oxide-red steel containers in the central yard, an elevated steel-framed Command
 * Overwatch canopy in the center-south plaza, a fortified North Command Bunker, and a 50 m East
 * Marksman Alley with overhead range baffles.
 */
export const shootHouse: GameMap = {
  id: 'shoot-house',
  name: 'Shoot House',
  subtitle: '70 M × 56 M · CQB KILLHOUSE & 50 M RANGE COMPOUND',
  summary:
    'Sun-baked modular plywood breach rooms, central container chicanes, a fortified north bunker, and a 50 m marksman lane built for aggressive corner-peeking and multi-range firefights.',
  locationTag: 'ARID TRAINING SECTOR 04',
  sectors: [
    'West CQB Killhouse',
    'Central Container Chicane',
    'North Command Bunker',
    'East 50 m Marksman Alley',
  ],
  bounds: { minX, maxX, minZ, maxZ },
  spawn: { position: { x: 0, y: 0, z: 24.2 }, yaw: 0 },
  rangeMarkings: {
    firingLineX: 22.8,
    firingLineZ: 17.6,
    firingLineWidth: 10.4,
    stencils: [
      ['15M', 3.8],
      ['25M', -7.5],
      ['40M', -21.5],
    ],
  },
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

    // === ZONE 1: SOUTH STAGING PLAZA & OBSERVATION CANOPY ===
    // Full-height plywood blast screen directly ahead of spawn with steel canopy frame overhead.
    ...plyX(19.4, -3.4, 3.4, 2.55),
    post(-3.4, 19.4, 3.45),
    post(3.4, 19.4, 3.45),
    box(-4.2, 3.32, 18.2, 4.2, 3.5, 21.6, 'steel'),
    barrier(-10.2, 18.2, -6.2, 18.75),
    barrier(6.2, 18.2, 10.2, 18.75),
    crate(-11.0, 21.4),
    crate(-11.0, 21.4, 1),
    crate(11.0, 21.4),

    // === ZONE 2: WEST CQB KILLHOUSE (x: -29.5..-12, z: -13..12) ===
    // Outer West Flank Trench runs cleanly along x: -35..-29.5!
    // South wall (z = 12) with 2.4 m breach doorway.
    ...plyX(12, -29.5, -22.2),
    ...plyX(12, -19.8, -12),
    lintelX(12, -22.2, -19.8),
    // North wall (z = -13) with 2.4 m rear breach doorway.
    ...plyX(-13, -29.5, -21.8),
    ...plyX(-13, -19.4, -12),
    lintelX(-13, -21.8, -19.4),
    // West wall (x = -29.5) with two flank doorways into the West Perimeter Trench.
    ...plyZ(-29.5, -13 + h, -6.2),
    ...plyZ(-29.5, -3.8, 4.2),
    ...plyZ(-29.5, 6.6, 12 - h),
    lintelZ(-29.5, -6.2, -3.8),
    lintelZ(-29.5, 4.2, 6.6),
    // East wall (x = -12) facing Central Yard with two wide 2.4 m doorways.
    ...plyZ(-12, -13 + h, -8.2),
    ...plyZ(-12, -5.8, 2.8),
    ...plyZ(-12, 5.2, 12 - h),
    lintelZ(-12, -8.2, -5.8),
    lintelZ(-12, 2.8, 5.2),
    // Interior CQB Room Dividers (South Entry Room, Central Killbox, North Locker Room).
    ...plyX(3.6, -29.5 + h, -22.2),
    ...plyX(3.6, -19.4, -12 - h),
    ...plyX(-4.6, -29.5 + h, -20.8),
    ...plyX(-4.6, -18.0, -12 - h),
    ...plyZ(-20.8, -13 + h, -7.6),
    ...plyZ(-20.8, 6.6, 12 - h),
    // Interior CQB hard cover & crates.
    barrier(-26.0, 7.6, -23.2, 8.1),
    barrier(-17.4, -0.4, -14.8, 0.1),
    crate(-25.8, -9.2),
    crate(-15.2, -9.4),
    // West Flank Trench cover (-34..-29.5).
    barrier(-33.6, 0.4, -31.2, 0.9),
    crate(-33.2, -17.5),
    post(-29.5, 12),
    post(-12, 12),
    post(-29.5, -13),
    post(-12, -13),
    ...breachRafters,

    // === ZONE 3: CENTRAL CONTAINER & COMMAND YARD (x: -12..13.8, z: -16..16) ===
    // Landmark 1: East-Central 20-ft corrugated navy steel shipping container.
    box(3.4, 0, -2.4, 6.2, 2.65, 4.2, 'container'),
    // Landmark 2: West-Central oxide-red shipping container creating a high-contrast chicane!
    box(-6.8, 0, -9.8, -4.0, 2.65, -3.4, 'container-red'),
    // Overhead steel gantry sign bridge linking the central container lane.
    box(-7.2, 2.72, -3.9, 6.6, 3.04, -3.45, 'steel'),
    // Staggered Central plywood shoot-walls & concrete Jersey barriers.
    ...plyX(8.8, -6.2, -1.8),
    post(-6.2, 8.8),
    post(-1.8, 8.8),
    barrier(-1.2, 12.2, 2.4, 12.75),
    barrier(7.4, 8.8, 10.6, 9.35),
    barrier(-9.6, -0.8, -6.8, -0.25),
    barrier(-0.8, -5.6, 2.6, -5.05),
    ...plyX(-11.8, 1.8, 7.4),
    post(1.8, -11.8),
    post(7.4, -11.8),
    // Tactical wooden crate clusters.
    crate(-7.8, 12.8),
    crate(-7.8, 12.8, 1),
    crate(9.6, 13.6),
    crate(-0.6, 2.2),
    crate(9.8, 0.6),
    crate(9.8, 0.6, 1),
    crate(-1.2, -11.2),
    crate(-9.4, -13.6),

    // === ZONE 4: NORTH COMMAND BUNKER & FLANK TRENCH (x: -29.5..13.8, z: -28..-16) ===
    // Brick-and-timber Command Bunker South Facade (z = -16) with two 2.4 m doorways + firing parapet.
    box(-10.5, 0, -16.16, -6.6, 2.74, -15.84, 'brick'),
    lintelX(-16, -6.6, -4.2),
    barrier(-4.2, -16.2, 3.2, -15.7, 1.12),
    lintelX(-16, 3.2, 5.6),
    box(5.6, 0, -16.16, 9.8, 2.74, -15.84, 'brick'),
    // Annex Side Walls stopping at z = -23.8 so North Back Trench stays open.
    ...plyZ(-10.5, -23.8, -16 - h),
    ...plyZ(9.8, -23.8, -16 - h),
    post(-10.5, -16),
    post(9.8, -16),
    post(-10.5, -23.8),
    post(9.8, -23.8),
    // Interior & Flank cover in North Sector.
    barrier(-2.2, -21.0, 1.6, -20.45),
    crate(-7.4, -20.4),
    crate(6.8, -20.4),
    barrier(-22.5, -20.0, -18.5, -19.45),
    crate(-15.0, -22.8),
    ...commandRafters,

    // === ZONE 5: EAST 50 m MARKSMAN ALLEY (x: 13.8..35, z: -28..28) ===
    // Dividing wall along x = 13.8 with THREE tactical cross-breaches.
    ...plyZ(13.8, -23.0, -17.8),
    lintelZ(13.8, -17.8, -15.4),
    ...plyZ(13.8, -15.4, -2.8),
    lintelZ(13.8, -2.8, -0.2),
    ...plyZ(13.8, -0.2, 12.2),
    lintelZ(13.8, 12.2, 14.8),
    ...plyZ(13.8, 14.8, 20.8),
    post(13.8, -23.0),
    post(13.8, 20.8),
    // South Overwatch Firing Deck (z = 18.2) — clean 44 m sightline down x: 18..29 to z = -25.0!
    barrier(18.0, 18.0, 26.2, 18.65, 1.05),
    crate(30.4, 20.8),
    crate(31.2, 20.8),
    crate(31.2, 20.8, 1),
    // Staggered side cover wings in Marksman Alley.
    ...plyX(7.5, 29.5, 34.2, 2.45),
    post(29.5, 7.5, 2.6),
    barrier(15.2, 2.0, 18.2, 2.55),
    ...plyX(-6.0, 13.8 + h, 18.2, 2.45),
    post(18.2, -6.0, 2.6),
    barrier(29.0, -11.5, 32.6, -10.95),
    barrier(19.5, -22.6, 24.5, -22.05),
    crate(31.4, -20.8),
    ...rangeBaffles,
  ],

  // 16 AR500 reactive steel silhouettes used in `practice` mode — all >= 2.4 m fall clearance.
  targets: [
    // West CQB Killhouse (5 targets)
    { position: { x: -26.4, y: 0, z: 9.2 }, facing: { x: 1, z: 0 } },
    { position: { x: -15.2, y: 0, z: 9.2 }, facing: { x: -1, z: 0 } },
    { position: { x: -24.8, y: 0, z: -1.2 }, facing: { x: 0, z: 1 } },
    { position: { x: -17.6, y: 0, z: -8.2 }, facing: { x: 0, z: 1 } },
    { position: { x: -32.2, y: 0, z: -9.5 }, facing: { x: 0, z: 1 } },

    // Central Container & Command Yard (5 targets)
    { position: { x: -8.2, y: 0, z: 7.4 }, facing: { x: 0, z: 1 } },
    { position: { x: 9.6, y: 0, z: 5.2 }, facing: { x: -1, z: 0 } },
    { position: { x: 0.4, y: 0, z: -8.6 }, facing: { x: 0, z: 1 } },
    { position: { x: -9.2, y: 0, z: -8.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 5.2, y: 0, z: -13.6 }, facing: { x: 0, z: 1 } },

    // North Command Bunker (2 targets)
    { position: { x: -4.8, y: 0, z: -23.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 4.8, y: 0, z: -23.2 }, facing: { x: 0, z: 1 } },

    // East 50 m Marksman Alley (4 targets at ~15 m, ~26 m, ~37 m, and ~43 m from South Firing Deck)
    { position: { x: 20.6, y: 0, z: 3.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 26.8, y: 0, z: -7.5 }, facing: { x: 0, z: 1 } },
    { position: { x: 19.6, y: 0, z: -18.5 }, facing: { x: 0, z: 1 } },
    { position: { x: 26.4, y: 0, z: -24.2 }, facing: { x: 0, z: 1 } },
  ],

  // 10 Tactical AI Enemy Spawns for Gun Game (8 kills required to win, 10 active in arena + reinforcement).
  // None have spawn-frame LOS to player spawn `(0, 0, 24.2)`.
  enemies: [
    {
      id: 'sh-hostile-01',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: -8.4, y: 0, z: 6.2 },
      yaw: 0.15,
      patrol: [
        { x: -8.4, y: 0, z: 6.2 },
        { x: -3.6, y: 0, z: 6.0 },
      ],
    },
    {
      id: 'sh-hostile-02',
      archetype: 'breacher',
      weaponId: 'mp5',
      position: { x: -16.8, y: 0, z: 8.2 },
      yaw: 0.2,
      patrol: [
        { x: -16.8, y: 0, z: 8.2 },
        { x: -24.2, y: 0, z: 9.4 },
      ],
    },
    {
      id: 'sh-hostile-03',
      archetype: 'breacher',
      weaponId: 'remington-870',
      position: { x: -23.8, y: 0, z: -0.8 },
      yaw: -0.4,
      patrol: [
        { x: -23.8, y: 0, z: -0.8 },
        { x: -15.8, y: 0, z: 1.4 },
      ],
    },
    {
      id: 'sh-hostile-04',
      archetype: 'assaulter',
      weaponId: 'ak47',
      position: { x: -32.2, y: 0, z: -8.5 },
      yaw: 0,
      patrol: [
        { x: -32.2, y: 0, z: -8.5 },
        { x: -32.2, y: 0, z: 3.5 },
      ],
    },
    {
      id: 'sh-hostile-05',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: 8.4, y: 0, z: 5.8 },
      yaw: 0.35,
      patrol: [
        { x: 8.4, y: 0, z: 5.8 },
        { x: 1.4, y: 0, z: 6.4 },
      ],
    },
    {
      id: 'sh-hostile-06',
      archetype: 'assaulter',
      weaponId: 'ak47',
      position: { x: -1.4, y: 0, z: -7.8 },
      yaw: 0.1,
      patrol: [
        { x: -1.4, y: 0, z: -7.8 },
        { x: 5.2, y: 0, z: -7.6 },
      ],
    },
    {
      id: 'sh-hostile-07',
      archetype: 'breacher',
      weaponId: 'mp5',
      position: { x: -18.5, y: 0, z: -16.8 },
      yaw: -0.25,
      patrol: [
        { x: -18.5, y: 0, z: -16.8 },
        { x: -13.5, y: 0, z: -14.8 },
      ],
    },
    {
      id: 'sh-hostile-08',
      archetype: 'marksman',
      weaponId: 'scar-h',
      position: { x: -0.5, y: 0, z: -18.6 },
      yaw: 0,
      patrol: [
        { x: -0.5, y: 0, z: -18.6 },
        { x: 4.4, y: 0, z: -18.8 },
      ],
    },
    {
      id: 'sh-hostile-09',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: 19.6, y: 0, z: -2.4 },
      yaw: 0,
      patrol: [
        { x: 19.6, y: 0, z: -2.4 },
        { x: 26.2, y: 0, z: -1.8 },
      ],
    },
    {
      id: 'sh-hostile-10',
      archetype: 'marksman',
      weaponId: 'scar-h',
      position: { x: 22.8, y: 0, z: -24.0 },
      yaw: 0.05,
      patrol: [
        { x: 22.8, y: 0, z: -24.0 },
        { x: 27.6, y: 0, z: -23.2 },
      ],
    },
  ],

  // Ground loot for combat modes. The first few lie on the way in from the spawn; the level 2
  // armour and the med kit are deep in the compound.
  loot: [
    onCrate('sh-loot-01', 11.0, 21.4, { kind: 'consumable', id: 'bandage', count: 5 }),
    onCrate('sh-loot-02', 9.6, 13.6, { kind: 'armour', piece: 'helmet', level: 1 }),
    onCrate('sh-loot-03', -0.6, 2.2, { kind: 'armour', piece: 'vest', level: 1 }),
    onCrate('sh-loot-04', 30.4, 20.8, { kind: 'consumable', id: 'energy-drink', count: 2 }),
    onCrate('sh-loot-05', -1.2, -11.2, { kind: 'consumable', id: 'first-aid', count: 1 }),
    onCrate('sh-loot-06', -9.4, -13.6, { kind: 'consumable', id: 'bandage', count: 5 }),
    onCrate('sh-loot-07', -15.2, -9.4, { kind: 'consumable', id: 'painkiller', count: 1 }),
    onCrate('sh-loot-08', -25.8, -9.2, { kind: 'armour', piece: 'vest', level: 2 }),
    onCrate('sh-loot-09', 6.8, -20.4, { kind: 'consumable', id: 'med-kit', count: 1 }),
    onCrate('sh-loot-10', -7.4, -20.4, { kind: 'consumable', id: 'first-aid', count: 1 }),
    onCrate('sh-loot-11', 31.4, -20.8, { kind: 'armour', piece: 'helmet', level: 2 }),
    onCrate('sh-loot-12', -15.0, -22.8, { kind: 'consumable', id: 'energy-drink', count: 1 }),
    onCrate('sh-loot-13', -33.2, -17.5, { kind: 'consumable', id: 'bandage', count: 5 }),
  ],
};
