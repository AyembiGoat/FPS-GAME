/** Player name and run history, kept in this browser. Nothing leaves the machine. */

export interface Run {
  readonly map: string;
  readonly mode: string;
  /** Seconds from the targets standing to the last one falling. */
  readonly seconds: number;
  readonly targetsHit: number;
  readonly targetsTotal: number;
  readonly shotsFired: number;
  /** ISO 8601 time the run finished. */
  readonly date: string;
}

/** Older runs drop off the end once there are this many. */
const RUN_LIMIT = 50;

const NAME_KEY = 'fps-game.name';
const RUNS_KEY = 'fps-game.runs';

/** Anything unreadable in the browser's storage is treated as not being there. */
function read(key: string): unknown {
  const saved = localStorage.getItem(key);
  if (saved === null) return null;
  try {
    return JSON.parse(saved) as unknown;
  } catch {
    return null;
  }
}

export function loadName(): string {
  const saved = read(NAME_KEY);
  return typeof saved === 'string' ? saved : '';
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, JSON.stringify(name));
}

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.map === 'string' &&
    typeof run.mode === 'string' &&
    typeof run.seconds === 'number' &&
    typeof run.targetsHit === 'number' &&
    typeof run.targetsTotal === 'number' &&
    typeof run.shotsFired === 'number' &&
    typeof run.date === 'string'
  );
}

export function loadRuns(): Run[] {
  const saved = read(RUNS_KEY);
  if (!Array.isArray(saved)) return [];
  const list: readonly unknown[] = saved;
  return list.filter(isRun);
}

export function addRun(run: Run): void {
  const runs = [run, ...loadRuns()].slice(0, RUN_LIMIT);
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

export interface RunSummary {
  readonly played: number;
  readonly bestSeconds: number | null;
  readonly shots: number;
  readonly accuracy: number | null;
}

export function summariseRuns(runs: readonly Run[]): RunSummary {
  let shots = 0;
  let hits = 0;
  let best: number | null = null;
  for (const run of runs) {
    shots += run.shotsFired;
    hits += run.targetsHit;
    if (best === null || run.seconds < best) best = run.seconds;
  }
  return {
    played: runs.length,
    bestSeconds: best,
    shots,
    // Every finished run has all its targets down, so this is hits per shot.
    accuracy: shots > 0 ? hits / shots : null,
  };
}

/** Minutes, seconds and tenths: 0:14.6. */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}
