import type { GameEvent } from '../core/game';
import { SIM_STEP_SECONDS } from '../core/fixedLoop';
import { MODES } from './menu/data';
import type { RunRecord } from './menu/state';

const MODE_NAME = MODES.find((mode) => mode.inGame)?.name ?? 'Knock down all targets';

/**
 * Turns a session into run records. A run ends when every target is down; the
 * game puts the targets back up a few seconds later, which starts the next run.
 * Only what happened in the simulation is counted, so every record is real.
 */
export function createRunRecorder(
  mapName: string,
  save: (run: RunRecord) => void,
): { step(events: readonly GameEvent[], targetsDown: readonly boolean[]): void } {
  let seconds = 0;
  let shots = 0;
  let hits = 0;
  let finished = false;

  return {
    step(events, targetsDown) {
      for (const event of events) {
        if (event.type === 'shot') {
          shots += 1;
        } else if (event.type === 'target-down') {
          hits += 1;
        } else if (event.type === 'targets-reset') {
          seconds = 0;
          shots = 0;
          hits = 0;
          finished = false;
        }
      }
      // The clock runs for the whole round, from the first step to the clear.
      if (!finished) seconds += SIM_STEP_SECONDS;

      if (finished || targetsDown.length === 0) return;
      if (!targetsDown.every(Boolean)) return;

      finished = true;
      save({
        map: mapName,
        mode: MODE_NAME,
        time: seconds,
        targetsHit: hits,
        shots,
        date: new Date().toISOString(),
      });
    },
  };
}
