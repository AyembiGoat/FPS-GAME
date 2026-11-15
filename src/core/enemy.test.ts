import { describe, expect, it } from 'vitest';
import {
  alertEnemiesByGunshot,
  createEnemy,
  damageEnemy,
  raycastEnemies,
  stepEnemies,
} from './enemy';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameMap } from './map';
import { STANDARD_COMBAT_TUNING } from './modes';
import { createSeededRng } from './rng';
import { vec3 } from './vec';
import { HK416 } from './weapon';

const dt = SIM_STEP_SECONDS;

const arena: GameMap = {
  id: 'shoot-house',
  name: 'Combat Arena',
  subtitle: 'TEST ARENA',
  summary: 'Deterministic enemy AI test arena.',
  locationTag: 'TEST',
  sectors: ['Center'],
  bounds: { minX: -16, maxX: 16, minZ: -20, maxZ: 16 },
  spawn: { position: { x: 0, y: 0, z: 10 }, yaw: 0 },
  solids: [
    { min: { x: -16, y: -1, z: -20 }, max: { x: 16, y: 0, z: 16 }, material: 'floor' },
    // Cover pillar to the side (`x: 3..5.5, z: -3..-2`)
    { min: { x: 3.0, y: 0, z: -3.0 }, max: { x: 5.5, y: 2.6, z: -2.0 }, material: 'plywood' },
  ],
  targets: [],
  enemies: [],
};

describe('enemy hitboxes, occlusion & mortality', () => {
  it('distinguishes head, torso, and leg hitboxes and ignores dead corpses', () => {
    const enemy = createEnemy({
      id: 'e1',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: vec3(0, 0, -10),
      yaw: 0,
      patrol: [vec3(0, 0, -10)],
    });

    const headHit = raycastEnemies(vec3(0, 1.62, 0), vec3(0, 0, -1), 30, [enemy]);
    expect(headHit?.zone).toBe('head');

    const torsoHit = raycastEnemies(vec3(0, 1.2, 0), vec3(0, 0, -1), 30, [enemy]);
    expect(torsoHit?.zone).toBe('torso');

    const legHit = raycastEnemies(vec3(0, 0.45, 0), vec3(0, 0, -1), 30, [enemy]);
    expect(legHit?.zone).toBe('legs');

    // Kill the enemy and confirm rays pass cleanly through the corpse to a live enemy behind.
    const killed = damageEnemy(enemy, 250, vec3(0, 0, 0), STANDARD_COMBAT_TUNING);
    expect(killed.killed).toBe(true);
    expect(killed.enemy.alive).toBe(false);

    const behind = createEnemy({
      id: 'e2',
      archetype: 'marksman',
      weaponId: 'scar-h',
      position: vec3(0, 0, -14),
      yaw: 0,
      patrol: [vec3(0, 0, -14)],
    });

    const passThrough = raycastEnemies(vec3(0, 1.2, 0), vec3(0, 0, -1), 30, [killed.enemy, behind]);
    expect(passThrough?.enemyId).toBe('e2');
  });

  it('enforces reaction delay, finite turn rate, magazine depletion, and reload cycle', () => {
    // Spawn enemy facing away (+Z is behind when yaw = 0, so place player at z = -12 while enemy faces +Z via yaw = PI -> wait: yaw 0 faces -Z!).
    // With yaw = Math.PI, enemy faces +Z (`0,0,1`), so player at `(0, 0, 8)` is directly in front of yaw = Math.PI, whereas yaw = 0 faces -Z (away from player at z = 8).
    let enemy = createEnemy({
      id: 'e1',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: vec3(0, 0, -2),
      yaw: 0, // facing -Z (away from player at z = 8, dist = 10m > peripheralRange 5.5m)
      patrol: [vec3(0, 0, -2)],
    });

    const rng = createSeededRng(42);
    const playerFeet = vec3(0, 0, 8);
    const playerEye = vec3(0, 1.65, 8);

    // Unalerted enemy facing away beyond peripheral range does NOT see player.
    const quietStep = stepEnemies([enemy], {
      map: arena,
      playerFeet,
      playerEye,
      playerAlive: true,
      tuning: STANDARD_COMBAT_TUNING,
      dt,
      rng,
    });
    expect(quietStep.enemies[0]?.canSeePlayer).toBe(false);
    expect(quietStep.shots).toHaveLength(0);

    // Gunshot nearby alerts the enemy; on the very first tick it cannot snap 180 deg or fire immediately.
    const alerted = alertEnemiesByGunshot(quietStep.enemies, playerFeet, STANDARD_COMBAT_TUNING);
    expect(alerted[0]?.aiState).toBe('alert');

    const turnStep = stepEnemies(alerted, {
      map: arena,
      playerFeet,
      playerEye,
      playerAlive: true,
      tuning: STANDARD_COMBAT_TUNING,
      dt,
      rng,
    });
    const turnedEnemy = turnStep.enemies[0];
    const alertedEnemy = alerted[0];
    if (!turnedEnemy || !alertedEnemy) throw new Error('Expected enemy');
    const turnedDelta = Math.abs(turnedEnemy.yaw - alertedEnemy.yaw);
    expect(turnedDelta).toBeLessThanOrEqual(STANDARD_COMBAT_TUNING.turnSpeed * dt + 1e-6);
    expect(turnStep.shots).toHaveLength(0); // Reaction time + turn time prevents first-frame snap shot!

    // Now place enemy facing player with only 1 round left, advance past reaction time so it fires & reloads.
    enemy = {
      ...turnedEnemy,
      yaw: Math.PI, // facing +Z toward player at z = 8
      rounds: 1,
      reactionRemaining: 0.25,
    };

    // During reaction window (first 10 ticks = 0.166s < 0.25s), zero shots fired.
    let list = [enemy];
    for (let i = 0; i < 10; i++) {
      const s = stepEnemies(list, {
        map: arena,
        playerFeet,
        playerEye,
        playerAlive: true,
        tuning: STANDARD_COMBAT_TUNING,
        dt,
        rng,
      });
      list = s.enemies;
      expect(s.shots).toHaveLength(0);
    }

    // Advance another 25 ticks -> fires its single round, hits 0 rounds, and enters reload!
    let totalShots = 0;
    let sawReload = false;
    for (let i = 0; i < 30; i++) {
      const s = stepEnemies(list, {
        map: arena,
        playerFeet,
        playerEye,
        playerAlive: true,
        tuning: STANDARD_COMBAT_TUNING,
        dt,
        rng,
      });
      list = s.enemies;
      totalShots += s.shots.length;
      if ((list[0]?.reloadRemaining ?? 0) > 0) sawReload = true;
    }
    expect(totalShots).toBe(1);
    expect(sawReload).toBe(true);

    // Advance full reload time and confirm magazine refills to 30.
    for (let i = 0; i < Math.ceil(HK416.reloadTime / dt) + 5; i++) {
      list = stepEnemies(list, {
        map: arena,
        playerFeet,
        playerEye,
        playerAlive: false,
        tuning: STANDARD_COMBAT_TUNING,
        dt,
        rng,
      }).enemies;
    }
    expect(list[0]?.rounds).toBe(HK416.magazineSize);
  });

  it('seeks occluded cover when wounded and steps deterministically for identical seeds', () => {
    const baseEnemy = createEnemy({
      id: 'e-cover',
      archetype: 'assaulter',
      weaponId: 'hk416',
      position: vec3(4.2, 0, 1.0), // just in front of plywood wall at x:3..5.5, z:-3..-2
      yaw: Math.PI,
      patrol: [vec3(4.2, 0, 1.0)],
    });

    const wounded = damageEnemy(baseEnemy, 55, vec3(4.2, 0, 10), STANDARD_COMBAT_TUNING).enemy;
    expect(wounded.aiState).toBe('cover');

    const runSim = (seed: number) => {
      const rng = createSeededRng(seed);
      let list = [wounded];
      for (let i = 0; i < 150; i++) {
        list = stepEnemies(list, {
          map: arena,
          playerFeet: vec3(4.2, 0, 10),
          playerEye: vec3(4.2, 1.65, 10),
          playerAlive: true,
          tuning: STANDARD_COMBAT_TUNING,
          dt,
          rng,
        }).enemies;
      }
      const first = list[0];
      if (!first) throw new Error('Expected enemy');
      return first;
    };

    const a = runSim(1337);
    const b = runSim(1337);
    expect(a.position).toEqual(b.position);
    expect(a.yaw).toBe(b.yaw);
    // Moved north behind the plywood wall (`z < -2.0`) away from the shooter at z = 10!
    expect(a.position.z).toBeLessThan(-2.0);
  });
});
