import { describe, expect, it } from 'vitest';
import { collidesAt } from './collision';
import { cargoYard, MAP_LIST, shootHouse } from './maps';
import {
  computeReachableMask,
  findCoverPosition,
  findPath,
  getNavGrid,
  hasLineOfSight,
  nearestWalkableCell,
} from './nav';
import { createPlayer, eyePosition } from './player';
import { vec3 } from './vec';

describe('navigation & dual-map tactical layouts (Shoot House & Cargo Yard)', () => {
  it('validates dimensions, clear spawns, and zero spawn-frame LOS across both maps', () => {
    expect(MAP_LIST.map((m) => m.id)).toEqual(['shoot-house', 'cargo-yard']);

    expect(shootHouse.bounds.maxX - shootHouse.bounds.minX).toBe(70);
    expect(shootHouse.bounds.maxZ - shootHouse.bounds.minZ).toBe(56);
    expect(cargoYard.bounds.maxX - cargoYard.bounds.minX).toBe(74);
    expect(cargoYard.bounds.maxZ - cargoYard.bounds.minZ).toBe(60);

    for (const map of MAP_LIST) {
      expect(map.enemies.length).toBe(10);
      expect(map.targets.length).toBe(16);

      const playerEye = eyePosition(createPlayer(map.spawn.position, map.spawn.yaw));
      for (const enemy of map.enemies) {
        expect(collidesAt(enemy.position, 0.34, 1.78, map.solids)).toBe(false);
        const enemyEye = vec3(enemy.position.x, 1.6, enemy.position.z);
        expect(hasLineOfSight(playerEye, enemyEye, map)).toBe(false);
      }
    }
  });

  it('connects player spawn, all 10 enemy spawns, and all patrol waypoints in one reachable graph on both maps', () => {
    for (const map of MAP_LIST) {
      const grid = getNavGrid(map);
      const reachable = computeReachableMask(grid, map.spawn.position);

      for (const enemy of map.enemies) {
        const spawnCell = nearestWalkableCell(grid, enemy.position, 2);
        expect(spawnCell).not.toBeNull();
        if (spawnCell) {
          expect(reachable[spawnCell.row * grid.cols + spawnCell.col]).toBe(1);
        }

        for (const wp of enemy.patrol) {
          expect(collidesAt(wp, 0.34, 1.78, map.solids)).toBe(false);
          const wpCell = nearestWalkableCell(grid, wp, 2);
          expect(wpCell).not.toBeNull();
          if (wpCell) {
            expect(reachable[wpCell.row * grid.cols + wpCell.col]).toBe(1);
          }
        }
      }
    }
  });

  it('plans collision-free A* paths across both Shoot House and Cargo Yard sectors', () => {
    for (const map of MAP_LIST) {
      const firstEnemy = map.enemies[2];
      const farEnemy = map.enemies[9];
      if (!firstEnemy || !farEnemy) throw new Error('Expected enemies');
      for (const [from, to] of [
        [map.spawn.position, firstEnemy.position],
        [firstEnemy.position, farEnemy.position],
      ] as const) {
        const path = findPath(map, from, to);
        expect(path.length).toBeGreaterThan(0);
        for (const wp of path) {
          expect(collidesAt(wp, 0.34, 1.78, map.solids)).toBe(false);
        }
      }
    }
  });

  it('finds occluded cover positions near exposed combatants', () => {
    const exposed = vec3(-1.4, 0, 6.2);
    const threatEye = vec3(0, 1.65, -8.0);
    const cover = findCoverPosition(shootHouse, exposed, threatEye, 9.5);
    expect(cover).not.toBeNull();
    if (!cover) throw new Error('Expected cover position');
    const standOccluded = !hasLineOfSight(vec3(cover.x, 1.58, cover.z), threatEye, shootHouse);
    const crouchOccluded = !hasLineOfSight(vec3(cover.x, 1.05, cover.z), threatEye, shootHouse);
    expect(standOccluded || crouchOccluded).toBe(true);
  });
});
