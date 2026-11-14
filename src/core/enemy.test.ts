import { describe, expect, it } from 'vitest';
import { bodyBox, overlaps } from './collision';
import type { EnemyEvent, EnemyState } from './enemy';
import {
  createEnemies,
  ENEMY_TUNING,
  enemyBlocker,
  hearGunshot,
  hitEnemy,
  isEnemyAlive,
  stepEnemies,
} from './enemy';
import { createGame } from './game';
import type { GameMap } from './map';
import { NO_INPUT, stepPlayer } from './player';

const dt = 1 / 60;

/** Empty room, 40 × 40 m, with a hostile and a motionless player. */
function room(enemy: { x: number; z: number; yaw: number }, wall?: 'between' | 'flank'): GameMap {
  const solids: GameMap['solids'][number][] = [
    { min: { x: -20, y: -1, z: -20 }, max: { x: 20, y: 0, z: 20 }, material: 'floor' },
  ];
  if (wall === 'between') {
    // Blocks the straight line, but leaves a gap to the right so there is a way round.
    solids.push({
      min: { x: -20, y: 0, z: -2 },
      max: { x: 5, y: 3, z: -1.5 },
      material: 'concrete',
    });
  }
  if (wall === 'flank') {
    // Covers everything to the player's left, so only a lean to the right clears it.
    solids.push({ min: { x: -20, y: 0, z: -3 }, max: { x: 0, y: 3, z: -2 }, material: 'plywood' });
  }
  return {
    name: 'Room',
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    solids,
    targets: [],
    enemySpawns: [{ position: { x: enemy.x, y: 0, z: enemy.z }, yaw: enemy.yaw }],
  };
}

function playerOf(map: GameMap) {
  return createGame(map, { mode: 'firefight' }).player;
}

function stepAll(
  enemies: readonly EnemyState[],
  map: GameMap,
  steps: number,
  onStep?: (enemies: readonly EnemyState[], events: readonly EnemyEvent[], index: number) => void,
  player = playerOf(map),
) {
  let current = enemies;
  const events: EnemyEvent[] = [];
  let seed = 0x1234;
  for (let i = 0; i < steps; i++) {
    const step = stepEnemies(current, player, map, dt, seed);
    current = step.enemies;
    seed = step.seed;
    events.push(...step.events);
    onStep?.(current, step.events, i);
  }
  return { enemies: current, events, seed };
}

describe('perception', () => {
  it('spots a player standing in front of it, inside its arc and range', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const enemies = createEnemies(map);
    expect(enemies[0]?.seen).toBe(false);
    const { enemies: after } = stepAll(enemies, map, 6);
    expect(after[0]?.seen).toBe(true);
    expect(after[0]?.visibleFor).toBeGreaterThan(0.05);
  });

  it('does not spot a player behind it', () => {
    const map = room({ x: 0, z: -8, yaw: 0 });
    const { enemies, events } = stepAll(createEnemies(map), map, 180);
    expect(enemies[0]?.seen).toBe(false);
    expect(enemies[0]?.behavior).toBe('guard');
    expect(events).toHaveLength(0);
  });

  it('does not spot a player hidden behind a wall, and never fires through it', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI }, 'between');
    const { enemies, events } = stepAll(createEnemies(map), map, 600);
    expect(enemies[0]?.seen).toBe(false);
    expect(events.some((event) => event.type === 'enemy-shot')).toBe(false);
  });

  it('does not spot a player beyond its detection range', () => {
    const long: GameMap = {
      ...room({ x: 0, z: -60, yaw: Math.PI }),
      bounds: { minX: -20, maxX: 20, minZ: -70, maxZ: 20 },
    };
    const near = room({ x: 0, z: -30, yaw: Math.PI });
    expect(stepAll(createEnemies(long), long, 6).enemies[0]?.seen).toBe(false);
    expect(stepAll(createEnemies(near), near, 6).enemies[0]?.seen).toBe(true);
    expect(stepAll(createEnemies(long), long, 6).enemies[0]?.position.z).toBeCloseTo(-60, 5);
  });

  it('needs a moment of continuous sight before it reacts', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const { enemies } = stepAll(createEnemies(map), map, 2);
    expect(enemies[0]?.seen).toBe(true);
    expect(enemies[0]?.aware).toBe(false);
    const aware = stepAll(enemies, map, 30).enemies[0];
    expect(aware?.aware).toBe(true);
    expect(aware?.behavior).toBe('engage');
  });
});

describe('reaction and turn rate', () => {
  it('waits out its reaction time before the first shot', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const shots: number[] = [];
    stepAll(createEnemies(map), map, 120, (_enemies, events, index) => {
      if (events.some((event) => event.type === 'enemy-shot')) shots.push(index * dt);
    });
    expect(shots.length).toBeGreaterThan(0);
    const first = shots[0] ?? 0;
    expect(first).toBeGreaterThan(
      ENEMY_TUNING.awarenessSeconds + ENEMY_TUNING.reactionSeconds - 0.05,
    );
    expect(first).toBeLessThan(ENEMY_TUNING.awarenessSeconds + ENEMY_TUNING.reactionSeconds + 0.35);
  });

  it('never turns faster than its turn rate', () => {
    // The player stands well off the hostile's facing, so it has to swing round.
    const map = room({ x: 6, z: -6, yaw: 0.4 });
    let previous = createEnemies(map)[0]?.yaw ?? 0;
    const limit = ENEMY_TUNING.turnRate * dt + 1e-9;
    stepAll(createEnemies(map), map, 240, (enemies) => {
      const yaw = enemies[0]?.yaw ?? 0;
      let delta = Math.abs(yaw - previous);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      expect(delta).toBeLessThanOrEqual(limit);
      previous = yaw;
    });
  });
});

describe('fire discipline', () => {
  it('fires in bursts and pauses between them', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const times: number[] = [];
    stepAll(createEnemies(map), map, 240, (_enemies, events, index) => {
      if (events.some((event) => event.type === 'enemy-shot')) times.push(index * dt);
    });
    const burst = times.slice(0, ENEMY_TUNING.burstLength);
    expect(burst).toHaveLength(ENEMY_TUNING.burstLength);
    for (let i = 1; i < burst.length; i++) {
      expect((burst[i] ?? 0) - (burst[i - 1] ?? 0)).toBeCloseTo(ENEMY_TUNING.fireInterval, 1);
    }
    const next = times[ENEMY_TUNING.burstLength] ?? 0;
    expect(next - (burst[burst.length - 1] ?? 0)).toBeGreaterThan(ENEMY_TUNING.burstPause);
  });

  it('empties its magazine, reloads, and does not fire while reloading', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    let reloading = 0;
    let shotsWhileReloading = 0;
    let sawEmpty = false;
    let sawRefill = false;
    const { events } = stepAll(createEnemies(map), map, 60 * 60, (current, stepEvents) => {
      if (reloading > 0.05 && stepEvents.some((event) => event.type === 'enemy-shot')) {
        shotsWhileReloading++;
      }
      reloading = current[0]?.reloadRemaining ?? 0;
      if (current[0]?.rounds === 0) sawEmpty = true;
      if (sawEmpty && (current[0]?.rounds ?? 0) >= ENEMY_TUNING.magazineSize - 1) sawRefill = true;
    });
    expect(events.some((event) => event.type === 'enemy-reload')).toBe(true);
    expect(shotsWhileReloading).toBe(0);
    expect(sawEmpty).toBe(true);
    expect(sawRefill).toBe(true);
  });

  it('stops firing when the player breaks line of sight', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI }, 'between');
    const visible = room({ x: 0, z: -8, yaw: Math.PI });
    // Start from a hostile that has already engaged, then move it behind the wall.
    const engaged = stepAll(createEnemies(visible), visible, 60).enemies[0];
    if (!engaged) throw new Error('no hostile');
    const moved: EnemyState = { ...engaged, position: { x: 0, y: 0, z: -8 } };
    const { events } = stepAll([moved], map, 60);
    expect(events.some((event) => event.type === 'enemy-shot')).toBe(false);
  });
});

describe('memory and movement', () => {
  it('remembers where the player was last seen, then gives up', () => {
    const open = room({ x: 0, z: -8, yaw: Math.PI });
    const walled = room({ x: 0, z: -8, yaw: Math.PI }, 'between');
    const engaged = stepAll(createEnemies(open), open, 60).enemies[0];
    if (!engaged) throw new Error('no hostile');
    expect(engaged.lastKnown?.z).toBeCloseTo(0, 1);

    const { enemies } = stepAll(
      [engaged],
      walled,
      Math.ceil(ENEMY_TUNING.memorySeconds / dt) + 120,
    );
    expect(enemies[0]?.lastKnown?.z).toBeCloseTo(0, 1);
    expect(enemies[0]?.behavior).not.toBe('engage');
    // It went looking: a hostile that has lost the player should not still be at home.
    expect(enemies[0]?.position.z).not.toBeCloseTo(-8, 2);
  });

  it('walks to the player without clipping walls or leaving the map', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI }, 'between');
    // A shot from the player's side gives it something to investigate round the wall.
    const player = playerOf(map);
    const enemies = hearGunshot(createEnemies(map), player.position);
    let clipped = false;
    let closest = Infinity;
    const { enemies: after } = stepAll(enemies, map, 60 * 20, (current) => {
      for (const enemy of current) {
        const body = enemyBlocker(enemy);
        for (const solid of map.solids) {
          if (solid.material === 'floor') continue;
          if (overlaps(body, solid)) clipped = true;
        }
        expect(enemy.position.x).toBeGreaterThan(map.bounds.minX);
        expect(enemy.position.x).toBeLessThan(map.bounds.maxX);
        expect(enemy.position.z).toBeGreaterThan(map.bounds.minZ);
        expect(enemy.position.z).toBeLessThan(map.bounds.maxZ);
      }
    });
    expect(clipped).toBe(false);
    expect(after[0]?.position).not.toEqual(enemies[0]?.position);
    for (const enemy of [after[0]]) {
      if (enemy) {
        closest = Math.min(
          closest,
          Math.hypot(enemy.position.x - player.position.x, enemy.position.z - player.position.z),
        );
      }
    }
    expect(closest).toBeLessThan(6);
  });

  it('leaves its post when it hears a shot, but does not learn anything it cannot see', () => {
    const map = room({ x: 0, z: -8, yaw: 0 }, 'between');
    const shot = { x: 0, y: 1.6, z: 6 };
    const heard = hearGunshot(createEnemies(map), shot);
    expect(heard[0]?.aware).toBe(true);
    expect(heard[0]?.behavior).toBe('engage');
    expect(heard[0]?.lastKnown?.z).toBeCloseTo(6, 5);

    // Even alerted, a wall still breaks its line of sight and it holds fire.
    const { events } = stepAll(heard, map, 240);
    expect(events.some((event) => event.type === 'enemy-shot')).toBe(false);
  });

  it('spots a player who leans out from cover, and not one who stays behind it', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI }, 'flank');
    const base = playerOf(map);
    let leaning = base;
    for (let i = 0; i < 60; i++) {
      leaning = stepPlayer(leaning, { ...NO_INPUT, lean: 1 }, dt, map.solids).state;
    }
    expect(leaning.lean).toBeGreaterThan(0.2);
    expect(stepAll(createEnemies(map), map, 6, undefined, base).enemies[0]?.seen).toBe(false);
    expect(stepAll(createEnemies(map), map, 6, undefined, leaning).enemies[0]?.seen).toBe(true);
  });
});

describe('damage and death', () => {
  it('turns onto whoever shot it and answers within a second', () => {
    const map = room({ x: 0, z: -8, yaw: 0 });
    const player = playerOf(map);
    const wounded = hitEnemy(createEnemies(map)[0] as EnemyState, 30, player.position);
    expect(wounded.health).toBe(ENEMY_TUNING.maxHealth - 30);
    expect(wounded.yaw).toBeCloseTo(Math.PI, 5);
    const { events } = stepAll([wounded], map, 90, undefined, player);
    expect(events.some((event) => event.type === 'enemy-shot')).toBe(true);
  });

  it('dies at zero health and stays inert', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const start = createEnemies(map)[0] as EnemyState;
    const dead = hitEnemy(hitEnemy(start, 60), 60);
    expect(dead.health).toBe(0);
    expect(isEnemyAlive(dead)).toBe(false);
    expect(() => enemyBlocker(dead)).not.toThrow();
    expect(bodyBox(dead.position, ENEMY_TUNING.radius, ENEMY_TUNING.height)).toBeDefined();

    const { enemies, events } = stepAll([dead], map, 300);
    expect(enemies[0]?.position).toEqual(dead.position);
    expect(enemies[0]?.health).toBe(0);
    expect(events).toHaveLength(0);
    expect(hitEnemy(enemies[0] as EnemyState, 30).health).toBe(0);
  });

  it('is deterministic for a seed', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const a = stepAll(createEnemies(map), map, 300);
    const b = stepAll(createEnemies(map), map, 300);
    expect(a.enemies).toEqual(b.enemies);
    expect(a.seed).toBe(b.seed);
    expect(a.events.length).toBe(b.events.length);
  });

  it('hurts a player who stands in the open', () => {
    const map = room({ x: 0, z: -8, yaw: Math.PI });
    const { events } = stepAll(createEnemies(map), map, 180);
    const shots = events.filter((event) => event.type === 'enemy-shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((event) => event.damage === ENEMY_TUNING.damage)).toBe(true);
    expect(shots.some((event) => event.playerHit)).toBe(true);
  });
});
