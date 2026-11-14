import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core/game';
import type { RunRecord } from './menu/state';
import { computeStats } from './menu/state';
import { createRunRecorder } from './run';

const down = (index: number): GameEvent => ({ type: 'target-down', index, distance: 10 });
const shot = (hit: boolean): GameEvent => ({
  type: 'shot',
  origin: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 0, z: 1 },
  hit: hit
    ? { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: -1 }, distance: 1, surface: 'target' }
    : null,
});

function record() {
  const saved: RunRecord[] = [];
  const recorder = createRunRecorder('Shoot House', (run) => saved.push(run));
  return { saved, recorder };
}

describe('createRunRecorder', () => {
  it('saves nothing until every target is down', () => {
    const { saved, recorder } = record();
    const targetsDown = [true, false];
    recorder.step([shot(true), down(0)], targetsDown);
    expect(saved).toEqual([]);
  });

  it('records a run with the shots and targets it saw', () => {
    const { saved, recorder } = record();
    recorder.step([shot(false)], [false, false]);
    recorder.step([shot(true), down(0)], [true, false]);
    recorder.step([shot(true), down(1)], [true, true]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ map: 'Shoot House', shots: 3, targetsHit: 2 });
    expect(saved[0]?.time).toBeGreaterThan(0);
  });

  it('records one run per clear, not one per step', () => {
    const { saved, recorder } = record();
    recorder.step([shot(true), down(0)], [true]);
    for (let i = 0; i < 30; i++) recorder.step([], [true]);
    expect(saved).toHaveLength(1);
  });

  it('starts a fresh run when the targets stand back up', () => {
    const { saved, recorder } = record();
    recorder.step([shot(true), down(0)], [true]);
    recorder.step([{ type: 'targets-reset' }], [false]);
    recorder.step([shot(true), down(0)], [true]);
    expect(saved).toHaveLength(2);
    expect(saved[1]?.shots).toBe(1);
    expect(saved[1]?.targetsHit).toBe(1);
  });
});

describe('computeStats', () => {
  const run = (time: number, shots: number, targetsHit: number): RunRecord => ({
    map: 'Shoot House',
    mode: 'Knock down all targets',
    time,
    targetsHit,
    shots,
    date: '2026-01-01T00:00:00.000Z',
  });

  it('reports nothing to show for no runs', () => {
    expect(computeStats([])).toEqual({
      runsPlayed: 0,
      bestTime: null,
      shotsFired: 0,
      accuracy: null,
    });
  });

  it('adds up runs and keeps the fastest time', () => {
    expect(computeStats([run(32, 20, 10), run(18.5, 10, 10)])).toEqual({
      runsPlayed: 2,
      bestTime: 18.5,
      shotsFired: 30,
      accuracy: 20 / 30,
    });
  });
});
