import type { GameMap, MapSolid, SurfaceMaterial } from '../map';

const BRICK_HEIGHT = 3.25;
const BRICK_HALF = 0.14;
const CAP_HALF = 0.17;
const CAP_HEIGHT = 0.1;
const PERIMETER_HEIGHT = 5.1;
const PERIMETER_THICK = 0.6;
const CRATE = 0.8;
const DOOR_TOP = 2.42;

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

/** Industrial clay-brick wall along X capped by a proud dark steel coping beam (zero coplanar faces). */
function brickX(z: number, x1: number, x2: number, height = BRICK_HEIGHT): MapSolid[] {
  return [
    box(x1, 0, z - BRICK_HALF, x2, height, z + BRICK_HALF, 'brick'),
    box(x1 - 0.01, height, z - CAP_HALF, x2 + 0.01, height + CAP_HEIGHT, z + CAP_HALF, 'steel'),
  ];
}

/** Industrial clay-brick wall along Z; cap stops short of X-wall caps to prevent Z-fighting. */
function brickZ(x: number, z1: number, z2: number, height = BRICK_HEIGHT): MapSolid[] {
  return [
    box(x - BRICK_HALF, 0, z1, x + BRICK_HALF, height, z2, 'brick'),
    box(x - CAP_HALF, height, z1 + 0.04, x + CAP_HALF, height + CAP_HEIGHT, z2 - 0.04, 'steel'),
  ];
}

/** Structural steel lintel spanning an X-axis brick warehouse doorway. */
function steelLintelX(z: number, x1: number, x2: number): MapSolid {
  return box(x1, DOOR_TOP, z - 0.16, x2, BRICK_HEIGHT + CAP_HEIGHT, z + 0.16, 'steel');
}

/** Structural steel lintel spanning a Z-axis brick warehouse doorway. */
function steelLintelZ(x: number, z1: number, z2: number): MapSolid {
  return box(x - 0.16, DOOR_TOP, z1, x + 0.16, BRICK_HEIGHT + CAP_HEIGHT, z2, 'steel');
}

/** Heavy steel portal column at structural corners and gantry bays. */
function steelCol(x: number, z: number, height = BRICK_HEIGHT + CAP_HEIGHT + 0.06): MapSolid {
  return box(x - 0.18, 0, z - 0.18, x + 0.18, height, z + 0.18, 'steel');
}

function crate(x: number, z: number, stack = 0): MapSolid {
  const half = CRATE / 2;
  const bottom = stack * CRATE;
  return box(x - half, bottom, z - half, x + half, bottom + CRATE, z + half, 'crate');
}

/** Waist-high port concrete bollard / Jersey barrier. */
function jersey(x1: number, z1: number, x2: number, z2: number, height = 1.08): MapSolid {
  return box(x1, 0, z1, x2, height, z2, 'concrete');
}

/** Overhead port crane gantry portal bridging a shipping lane (`y = 4.35..4.90 m`). */
function gantryPortal(z: number, xLeft: number, xRight: number): MapSolid[] {
  return [
    box(xLeft - 0.24, 0, z - 0.24, xLeft + 0.24, 4.95, z + 0.24, 'steel'),
    box(xRight - 0.24, 0, z - 0.24, xRight + 0.24, 4.95, z + 0.24, 'steel'),
    box(xLeft - 0.3, 4.38, z - 0.22, xRight + 0.3, 4.88, z + 0.22, 'steel'),
  ];
}

const minX = -37;
const maxX = 37;
const minZ = -30;
const maxZ = 30;
const bh = BRICK_HALF;

// Perimeter brick-and-steel port security pilasters around the 74 m × 60 m terminal.
const perimeterButtresses: MapSolid[] = [
  ...[-28, -18, -8, 8, 18, 28].flatMap((x) => [
    box(x - 0.28, 0, minZ, x + 0.28, PERIMETER_HEIGHT + 0.06, minZ + 0.34, 'steel'),
    box(x - 0.28, 0, maxZ - 0.34, x + 0.28, PERIMETER_HEIGHT + 0.06, maxZ, 'steel'),
  ]),
  ...[-22, -12, -2, 8, 18].flatMap((z) => [
    box(minX, 0, z - 0.28, minX + 0.34, PERIMETER_HEIGHT + 0.06, z + 0.28, 'steel'),
    box(maxX - 0.34, 0, z - 0.28, maxX, PERIMETER_HEIGHT + 0.06, z + 0.28, 'steel'),
  ]),
];

// Overhead steel roof trusses above the West Brick Freight Warehouse.
const warehouseTrusses: MapSolid[] = [-12, -7.5, -3, 1.5, 6, 10.5].map((z) =>
  box(-32.0, 3.62, z - 0.11, -13.5, 3.88, z + 0.11, 'steel'),
);

// Overhead steel canopy rafters above the North Customs Dispatch Shed.
const dispatchTrusses: MapSolid[] = [-10, -5, 0, 5, 10].map((x) =>
  box(x - 0.11, 3.62, -26.5, x + 0.11, 3.88, -17.5, 'steel'),
);

/**
 * Second Arena Map — Cargo Yard (74 m × 60 m Maritime Freight Terminal):
 * Built from dark harbor asphalt, industrial clay-brick freight warehouses, dark structural
 * steel gantry cranes, and double-stacked oxide-red & slate-blue 20-ft shipping containers:
 * 1. South Truck Apron & Dispatch Gate (z: 18..30): Oxide-red gatehouse container + gantry arch.
 * 2. West Brick Freight Warehouse (x: -32..-13.5, z: -14..13): Multi-bay brick loading dock + back alley.
 * 3. Central Container Maze (x: -13.5..15, z: -17..17): Double-stacked maritime & red containers under overhead cranes.
 * 4. North Customs Shed & Dock Wall (x: -32..15, z: -30..-17.5): Brick customs office with wide firing windows.
 * 5. East 52 m Crane Rail & Pier Lane (x: 15..37, z: -30..30): Long-range harbor rail sightline beneath crane portals.
 */
export const cargoYard: GameMap = {
  id: 'cargo-yard',
  name: 'Cargo Yard',
  subtitle: '74 M × 60 M · MARITIME FREIGHT TERMINAL & BRICK WAREHOUSE',
  summary:
    'Dark harbor asphalt lined with double-stacked red and navy cargo containers, an industrial clay-brick loading warehouse, overhead steel crane gantries, and a 52 m pier rail lane.',
  locationTag: 'PORT TERMINAL BERTH 09',
  sectors: [
    'West Brick Warehouse',
    'Double-Stack Container Maze',
    'North Customs Shed',
    'East 52 m Crane Pier',
  ],
  bounds: { minX, maxX, minZ, maxZ },
  spawn: { position: { x: 0, y: 0, z: 25.8 }, yaw: 0 },
  rangeMarkings: {
    firingLineX: 25.8,
    firingLineZ: 19.2,
    firingLineWidth: 11.2,
    stencils: [
      ['15M', 4.2],
      ['30M', -10.8],
      ['45M', -24.8],
    ],
  },
  solids: [
    // Dark harbor asphalt slab.
    box(minX, -1, minZ, maxX, 0, maxZ, 'asphalt'),

    // Perimeter industrial brick & concrete seawall enclosure.
    box(
      minX - PERIMETER_THICK,
      0,
      minZ - PERIMETER_THICK,
      maxX + PERIMETER_THICK,
      PERIMETER_HEIGHT,
      minZ,
      'brick',
    ),
    box(
      minX - PERIMETER_THICK,
      0,
      maxZ,
      maxX + PERIMETER_THICK,
      PERIMETER_HEIGHT,
      maxZ + PERIMETER_THICK,
      'brick',
    ),
    box(minX - PERIMETER_THICK, 0, minZ, minX, PERIMETER_HEIGHT, maxZ, 'concrete'),
    box(maxX, 0, minZ, maxX + PERIMETER_THICK, PERIMETER_HEIGHT, maxZ, 'concrete'),
    ...perimeterButtresses,

    // === ZONE 1: SOUTH TRUCK APRON & DISPATCH GATE (z: 18..30) ===
    // Transverse 20-ft red security container directly ahead of spawn so player splits left or right safely.
    box(-3.8, 0, 19.6, 3.8, 2.65, 22.2, 'container-red'),
    ...gantryPortal(17.8, -11.8, 11.8),
    jersey(-11.2, 20.4, -6.8, 21.0),
    jersey(6.8, 20.4, 11.2, 21.0),
    crate(-12.6, 23.6),
    crate(12.6, 23.6),
    crate(12.6, 23.6, 1),

    // === ZONE 2: WEST BRICK FREIGHT WAREHOUSE (x: -32..-13.5, z: -14..13) ===
    // Outer West Dock Service Alley runs cleanly along x: -37..-32!
    // South brick facade (z = 13) with wide 2.8 m truck-bay roll-up doorway.
    ...brickX(13, -32, -24.2),
    ...brickX(13, -21.4, -13.5),
    steelLintelX(13, -24.2, -21.4),
    // North brick facade (z = -14) with 2.8 m rear loading doorway.
    ...brickX(-14, -32, -23.8),
    ...brickX(-14, -21.0, -13.5),
    steelLintelX(-14, -23.8, -21.0),
    // West brick wall (x = -32) with two service doors into the West Alley.
    ...brickZ(-32, -14 + bh, -6.6),
    ...brickZ(-32, -3.8, 4.4),
    ...brickZ(-32, 7.2, 13 - bh),
    steelLintelZ(-32, -6.6, -3.8),
    steelLintelZ(-32, 4.4, 7.2),
    // East loading dock wall (x = -13.5) facing Container Maze with two wide 3.0 m bay openings!
    ...brickZ(-13.5, -14 + bh, -8.6),
    ...brickZ(-13.5, -5.6, 3.2),
    ...brickZ(-13.5, 6.2, 13 - bh),
    steelLintelZ(-13.5, -8.6, -5.6),
    steelLintelZ(-13.5, 3.2, 6.2),
    // Interior warehouse partition walls (South Receiving Bay, Central Pallet Hall, North Cold-Storage).
    ...brickX(4.2, -32 + bh, -24.4),
    ...brickX(4.2, -21.0, -13.5 - bh),
    ...brickX(-5.2, -32 + bh, -22.6),
    ...brickX(-5.2, -19.2, -13.5 - bh),
    // Interior pallet crates & concrete dock bumpers.
    jersey(-28.4, 8.6, -25.2, 9.15),
    jersey(-19.2, -0.6, -16.2, -0.05),
    crate(-28.2, -9.8),
    crate(-28.2, -9.8, 1),
    crate(-16.8, -10.2),
    // West Service Alley cover.
    jersey(-35.6, 0.2, -33.4, 0.75),
    crate(-35.0, -18.5),
    steelCol(-32, 13),
    steelCol(-13.5, 13),
    steelCol(-32, -14),
    steelCol(-13.5, -14),
    ...warehouseTrusses,

    // === ZONE 3: CENTRAL DOUBLE-STACK CONTAINER MAZE (x: -13.5..15, z: -17..17) ===
    // Double-stacked Navy Containers on West-Center (`y = 0..5.3 m` landmark!).
    box(-8.2, 0, 2.2, -5.4, 2.65, 9.0, 'container'),
    box(-8.15, 2.66, 2.5, -5.45, 5.26, 8.7, 'container-red'),
    // Angled-offset Oxide-Red Container in Center-East (`x: 4.8..7.6, z: 3.4..10.2`).
    box(4.8, 0, 3.4, 7.6, 2.65, 10.2, 'container-red'),
    // Central Transverse Navy Container splitting North & South container plazas (`z: -3.8..-1.0`).
    box(-2.8, 0, -3.8, 3.8, 2.65, -1.0, 'container'),
    // North-East Double-Stacked Container Tower (`x: 5.8..8.6, z: -13.4..-6.6`).
    box(5.8, 0, -13.4, 8.6, 2.65, -6.6, 'container-red'),
    box(5.85, 2.66, -13.1, 8.55, 5.26, -6.9, 'container'),
    // North-West Single Navy Container (`x: -8.8..-6.0, z: -13.2..-6.8`).
    box(-8.8, 0, -13.2, -6.0, 2.65, -6.8, 'container'),
    // Overhead Yard Crane Gantry spanning the entire Central Container Maze!
    ...gantryPortal(-2.4, -11.8, 12.6),
    // Concrete Jersey barriers & shipping crate clusters creating lean/peek angles between stacks.
    jersey(-1.8, 12.8, 2.2, 13.35),
    jersey(9.4, 11.2, 12.6, 11.75),
    jersey(-11.4, -2.2, -9.0, -1.65),
    jersey(-1.8, -10.2, 2.0, -9.65),
    crate(-1.2, 5.6),
    crate(-1.2, 5.6, 1),
    crate(10.8, 0.4),
    crate(-2.4, -14.2),
    crate(11.4, -14.2),

    // === ZONE 4: NORTH CUSTOMS DISPATCH SHED (x: -32..15, z: -30..-17.5) ===
    // Brick South Facade (z = -17.5) with two 2.8 m doorways and central waist-high customs counter window.
    ...brickX(-17.5, -11.5, -7.2),
    steelLintelX(-17.5, -7.2, -4.4),
    jersey(-4.4, -17.7, 3.8, -17.15, 1.12),
    steelLintelX(-17.5, 3.8, 6.6),
    ...brickX(-17.5, 6.6, 11.2),
    // Side brick walls stopping at z = -25.4 so the North Seawall Flank Trench stays open!
    ...brickZ(-11.5, -25.4, -17.5 - bh),
    ...brickZ(11.2, -25.4, -17.5 - bh),
    steelCol(-11.5, -17.5),
    steelCol(11.2, -17.5),
    steelCol(-11.5, -25.4),
    steelCol(11.2, -25.4),
    jersey(-2.4, -22.6, 2.0, -22.05),
    crate(-8.2, -22.0),
    crate(8.0, -22.0),
    jersey(-24.5, -21.8, -20.0, -21.25),
    crate(-16.2, -24.6),
    ...dispatchTrusses,

    // === ZONE 5: EAST 52 m CRANE RAIL & PIER LANE (x: 15..37, z: -30..30) ===
    // Brick & container dividing wall along x = 15.0 with THREE wide cross-connectors (z=14.4, z=-1.6, z=-18.0).
    ...brickZ(15.0, -24.8, -19.4),
    steelLintelZ(15.0, -19.4, -16.6),
    ...brickZ(15.0, -16.6, -3.0),
    steelLintelZ(15.0, -3.0, -0.2),
    ...brickZ(15.0, -0.2, 13.0),
    steelLintelZ(15.0, 13.0, 15.8),
    ...brickZ(15.0, 15.8, 22.4),
    steelCol(15.0, -24.8),
    steelCol(15.0, 22.4),
    // Three towering steel harbor crane portals straddling the 52 m East Pier Lane (`x = 16.4..35.8`)!
    ...gantryPortal(10.0, 16.4, 35.8),
    ...gantryPortal(-5.0, 16.4, 35.8),
    ...gantryPortal(-20.0, 16.4, 35.8),
    // South Pier Overwatch Firing Bench (z = 19.8) — clean 46 m sniper sightline down x: 20..31 to z = -26.5!
    jersey(20.2, 19.6, 29.4, 20.25, 1.06),
    crate(33.2, 22.2),
    crate(34.0, 22.2),
    crate(34.0, 22.2, 1),
    // Staggered dockside containers & bollards along the edges of the Crane Lane (central sightline unobstructed).
    box(32.4, 0, 1.5, 35.2, 2.65, 8.1, 'container'),
    jersey(16.8, 3.2, 20.0, 3.75),
    box(16.6, 0, -13.6, 19.4, 2.65, -7.0, 'container-red'),
    jersey(31.2, -13.2, 34.8, -12.65),
    jersey(21.5, -24.6, 26.8, -24.05),
    crate(33.4, -22.6),
  ],

  // 16 AR500 reactive steel silhouettes for Practice mode — all >= 2.4 m fall space behind them.
  targets: [
    // West Brick Freight Warehouse (5 targets)
    { position: { x: -29.0, y: 0, z: 10.0 }, facing: { x: 1, z: 0 } },
    { position: { x: -16.8, y: 0, z: 10.0 }, facing: { x: -1, z: 0 } },
    { position: { x: -27.4, y: 0, z: -1.4 }, facing: { x: 0, z: 1 } },
    { position: { x: -18.8, y: 0, z: -9.4 }, facing: { x: 0, z: 1 } },
    { position: { x: -34.4, y: 0, z: -10.5 }, facing: { x: 0, z: 1 } },

    // Central Double-Stack Container Maze (5 targets)
    { position: { x: -10.6, y: 0, z: 8.6 }, facing: { x: 0, z: 1 } },
    { position: { x: 11.2, y: 0, z: 6.4 }, facing: { x: -1, z: 0 } },
    { position: { x: 0.6, y: 0, z: -7.2 }, facing: { x: 0, z: 1 } },
    { position: { x: -11.0, y: 0, z: -9.6 }, facing: { x: 0, z: 1 } },
    { position: { x: 3.0, y: 0, z: -14.8 }, facing: { x: 0, z: 1 } },

    // North Customs Shed (2 targets)
    { position: { x: -5.4, y: 0, z: -24.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 5.4, y: 0, z: -24.8 }, facing: { x: 0, z: 1 } },

    // East 52 m Crane Pier Lane (4 targets at ~15 m, ~30 m, ~40 m, and ~46 m from South Pier Bench)
    { position: { x: 22.8, y: 0, z: 4.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 28.8, y: 0, z: -10.8 }, facing: { x: 0, z: 1 } },
    { position: { x: 22.2, y: 0, z: -20.2 }, facing: { x: 0, z: 1 } },
    { position: { x: 28.6, y: 0, z: -26.2 }, facing: { x: 0, z: 1 } },
  ],

  // 10 Tactical AI Enemy Spawns for Gun Game (none have spawn-frame LOS to `(0, 0, 25.8)`).
  enemies: [
    {
      id: 'cy-hostile-01',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: -10.6, y: 0, z: 7.4 },
      yaw: 0.15,
      patrol: [
        { x: -10.6, y: 0, z: 7.4 },
        { x: -3.4, y: 0, z: 7.2 },
      ],
    },
    {
      id: 'cy-hostile-02',
      archetype: 'breacher',
      weaponId: 'mp5',
      position: { x: -18.2, y: 0, z: 8.8 },
      yaw: 0.2,
      patrol: [
        { x: -18.2, y: 0, z: 8.8 },
        { x: -26.8, y: 0, z: 10.2 },
      ],
    },
    {
      id: 'cy-hostile-03',
      archetype: 'breacher',
      weaponId: 'remington-870',
      position: { x: -26.2, y: 0, z: -0.8 },
      yaw: -0.35,
      patrol: [
        { x: -26.2, y: 0, z: -0.8 },
        { x: -17.4, y: 0, z: 1.4 },
      ],
    },
    {
      id: 'cy-hostile-04',
      archetype: 'assaulter',
      weaponId: 'ak47',
      position: { x: -34.4, y: 0, z: -9.2 },
      yaw: 0,
      patrol: [
        { x: -34.4, y: 0, z: -9.2 },
        { x: -34.4, y: 0, z: 4.0 },
      ],
    },
    {
      id: 'cy-hostile-05',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: 10.4, y: 0, z: 6.8 },
      yaw: 0.35,
      patrol: [
        { x: 10.4, y: 0, z: 6.8 },
        { x: 1.8, y: 0, z: 7.8 },
      ],
    },
    {
      id: 'cy-hostile-06',
      archetype: 'assaulter',
      weaponId: 'ak47',
      position: { x: -2.0, y: 0, z: -6.8 },
      yaw: 0.1,
      patrol: [
        { x: -2.0, y: 0, z: -6.8 },
        { x: 3.4, y: 0, z: -6.6 },
      ],
    },
    {
      id: 'cy-hostile-07',
      archetype: 'breacher',
      weaponId: 'mp5',
      position: { x: -19.8, y: 0, z: -18.2 },
      yaw: -0.25,
      patrol: [
        { x: -19.8, y: 0, z: -18.2 },
        { x: -14.8, y: 0, z: -15.8 },
      ],
    },
    {
      id: 'cy-hostile-08',
      archetype: 'marksman',
      weaponId: 'scar-h',
      position: { x: -0.6, y: 0, z: -20.2 },
      yaw: 0,
      patrol: [
        { x: -0.6, y: 0, z: -20.2 },
        { x: 4.8, y: 0, z: -20.4 },
      ],
    },
    {
      id: 'cy-hostile-09',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: { x: 22.8, y: 0, z: -2.6 },
      yaw: 0,
      patrol: [
        { x: 22.8, y: 0, z: -2.6 },
        { x: 29.2, y: 0, z: -1.8 },
      ],
    },
    {
      id: 'cy-hostile-10',
      archetype: 'marksman',
      weaponId: 'scar-h',
      position: { x: 24.8, y: 0, z: -26.0 },
      yaw: 0.05,
      patrol: [
        { x: 24.8, y: 0, z: -26.0 },
        { x: 30.0, y: 0, z: -25.2 },
      ],
    },
  ],
};
