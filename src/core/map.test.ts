import { describe, expect, it } from 'vitest';
import { bodyBox, overlaps, raycast } from './collision';
import { shootHouse } from './maps/shootHouse';
import type { GameMap, MapSolid } from './map';
import { cellCentre, findPath, navGrid, nearestOpenCell } from './nav';
import { PLAYER_TUNING } from './player';
import { ENEMY_TUNING, enemyEye } from './enemy';

const maps: readonly GameMap[] = [shootHouse];

const wallsOf = (map: GameMap): readonly MapSolid[] =>
  map.solids.filter((solid) => solid.material !== 'floor');

function bodyFits(map: GameMap, x: number, z: number, height = PLAYER_TUNING.height): boolean {
  const body = bodyBox({ x, y: 0.01, z }, PLAYER_TUNING.radius, height);
  return !wallsOf(map).some((solid) => overlaps(body, solid));
}

function reachable(map: GameMap, from: { x: number; z: number }, to: { x: number; z: number }) {
  const grid = navGrid(map);
  const path = findPath(grid, map, { x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z });
  return path.length > 0;
}

describe.each(maps)('$name map', (map) => {
  it('keeps every solid inside the compound footprint', () => {
    for (const solid of map.solids) {
      expect(solid.min.x).toBeGreaterThanOrEqual(map.bounds.minX - 0.5 - 1e-6);
      expect(solid.max.x).toBeLessThanOrEqual(map.bounds.maxX + 0.5 + 1e-6);
      expect(solid.min.z).toBeGreaterThanOrEqual(map.bounds.minZ - 0.5 - 1e-6);
      expect(solid.max.z).toBeLessThanOrEqual(map.bounds.maxZ + 0.5 + 1e-6);
      expect(solid.max.y).toBeGreaterThan(solid.min.y);
    }
  });

  it('has a spawn the player fits in and faces into the map', () => {
    expect(bodyFits(map, map.spawn.position.x, map.spawn.position.z)).toBe(true);
  });

  it('starts every hostile on clear floor, spread out and away from the player spawn', () => {
    expect(map.enemySpawns.length).toBeGreaterThanOrEqual(4);
    for (const spawn of map.enemySpawns) {
      expect(bodyFits(map, spawn.position.x, spawn.position.z)).toBe(true);
      const distance = Math.hypot(
        spawn.position.x - map.spawn.position.x,
        spawn.position.z - map.spawn.position.z,
      );
      expect(distance).toBeGreaterThan(12);
    }
    // No two hostiles start on top of each other.
    for (let i = 0; i < map.enemySpawns.length; i++) {
      for (let j = i + 1; j < map.enemySpawns.length; j++) {
        const a = map.enemySpawns[i];
        const b = map.enemySpawns[j];
        if (!a || !b) continue;
        expect(
          Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
        ).toBeGreaterThan(4);
      }
    }
  });

  it('does not let a hostile see the player spawn from where it starts', () => {
    const eye = {
      x: map.spawn.position.x,
      y: PLAYER_TUNING.eyeHeight,
      z: map.spawn.position.z,
    };
    for (const spawn of map.enemySpawns) {
      const target = enemyEye({
        x: spawn.position.x,
        y: 0,
        z: spawn.position.z,
      });
      const delta = {
        x: target.x - eye.x,
        y: target.y - eye.y,
        z: target.z - eye.z,
      };
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      const direction = {
        x: delta.x / distance,
        y: delta.y / distance,
        z: delta.z / distance,
      };
      // A solid must stop the ray before it reaches the hostile.
      expect(
        raycast(eye, direction, distance - 0.1, map.solids),
        JSON.stringify(spawn),
      ).not.toBeNull();
    }
  });

  it('gives every steel plate clear floor behind it and a clear approach in front', () => {
    for (const target of map.targets) {
      const backX = -target.facing.x;
      const backZ = -target.facing.z;
      const fallBox = {
        min: {
          x: Math.min(target.position.x, target.position.x + backX * 2) - 0.22,
          y: 0.05,
          z: Math.min(target.position.z, target.position.z + backZ * 2) - 0.22,
        },
        max: {
          x: Math.max(target.position.x, target.position.x + backX * 2) + 0.22,
          y: 0.9,
          z: Math.max(target.position.z, target.position.z + backZ * 2) + 0.22,
        },
      };
      expect(wallsOf(map).some((solid) => overlaps(fallBox, solid))).toBe(false);
      expect(bodyFits(map, target.position.x, target.position.z)).toBe(true);
    }
  });

  it('connects the spawn to every hostile, plate and landmark on foot', () => {
    const start = map.spawn.position;
    const landmarks = [
      { x: 3.0, z: -12.0, label: 'central yard' },
      { x: 3.0, z: -20.0, label: 'north road (yard opening)' },
      { x: 23.5, z: -20.5, label: 'north road (east lane opening)' },
      { x: 22.0, z: 0.0, label: 'east lane' },
      { x: 23.5, z: -13.0, label: 'east lane north' },
      { x: -28.5, z: 0.0, label: 'west alley' },
      { x: -20.0, z: 4.0, label: 'breach house' },
      { x: -24.0, z: -6.0, label: 'breach house west rooms' },
      { x: -10.0, z: 20.0, label: 'south yard' },
    ];
    for (const point of landmarks) {
      expect(reachable(map, start, point), point.label).toBe(true);
    }
    for (const spawn of map.enemySpawns) {
      expect(reachable(map, start, spawn.position)).toBe(true);
    }
    // The west alley really is a separate way round: it reaches the north road without
    // passing the house or the central yard.
    expect(reachable(map, { x: -28.5, z: 12 }, { x: -28.5, z: -24 })).toBe(true);
  });

  it('has a long sightline down most of the east lane', () => {
    const eye = { x: 23.0, y: PLAYER_TUNING.eyeHeight, z: 9.0 };
    const hit = raycast(eye, { x: 0, y: 0, z: -1 }, 60, wallsOf(map));
    expect(hit).not.toBeNull();
    expect(hit?.distance ?? 0).toBeGreaterThan(30);
  });

  it('lets hostiles reach every cover point in the yard and the house', () => {
    const grid = navGrid(map);
    const points = [
      { x: 10.0, z: -14.0 },
      { x: -10.0, z: 2.0 },
      { x: 18.0, z: -14.0 },
      { x: -20.0, z: -8.0 },
      { x: 2.0, z: -20.0 },
    ];
    for (const spawn of map.enemySpawns) {
      for (const point of points) {
        const from = nearestOpenCell(grid, map, spawn.position.x, spawn.position.z);
        const to = nearestOpenCell(grid, map, point.x, point.z);
        expect(to).toBeGreaterThanOrEqual(0);
        const path = findPath(grid, map, cellCentre(grid, from), cellCentre(grid, to));
        expect(
          path.length,
          `${spawn.position.x},${spawn.position.z} -> ${point.x},${point.z}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('hostile sizing', () => {
  it('is tall enough to be a person and short enough to use the doorways', () => {
    expect(ENEMY_TUNING.height).toBeGreaterThan(1.7);
    expect(ENEMY_TUNING.height).toBeLessThan(2.05);
    expect(ENEMY_TUNING.radius).toBeLessThan(0.45);
  });
});
