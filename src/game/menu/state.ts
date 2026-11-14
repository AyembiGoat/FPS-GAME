/**
 * The menu's saved state: the player name, past runs, and which things are
 * selected. Only the browser stores this; the game itself reads none of it
 * except where the menu starts it.
 */

import {
  ATTACHMENTS,
  ATTACHMENT_SLOTS,
  CHARACTERS,
  LOADOUT_SLOTS,
  MAPS,
  MODES,
  SKINS,
  WEAPONS,
} from './data';

const NAME_KEY = 'fps-game:name';
const RUNS_KEY = 'fps-game:runs';
const SELECTIONS_KEY = 'fps-game:selections';

export interface RunRecord {
  readonly map: string;
  readonly mode: string;
  readonly time: number;
  readonly targetsHit: number;
  readonly shots: number;
  readonly date: string;
}

export interface LoadoutSelection {
  weaponId: string;
  attachments: Record<string, string>;
}

export interface Selections {
  loadoutSlot: string;
  loadouts: Record<string, LoadoutSelection>;
  skins: Record<string, string>;
  mapId: string;
  modeId: string;
  characterId: string;
}

export interface Stats {
  readonly runsPlayed: number;
  readonly bestTime: number | null;
  readonly shotsFired: number;
  readonly accuracy: number | null;
}

export function computeStats(runs: readonly RunRecord[]): Stats {
  if (runs.length === 0) return { runsPlayed: 0, bestTime: null, shotsFired: 0, accuracy: null };
  let bestTime: number | null = null;
  let shotsFired = 0;
  let hits = 0;
  for (const run of runs) {
    if (bestTime === null || run.time < bestTime) bestTime = run.time;
    shotsFired += run.shots;
    hits += run.targetsHit;
  }
  return {
    runsPlayed: runs.length,
    bestTime,
    shotsFired,
    accuracy: shotsFired > 0 ? hits / shotsFired : null,
  };
}

export function loadName(): string | null {
  const stored = localStorage.getItem(NAME_KEY);
  return stored === null || stored === '' ? null : stored;
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

/**
 * Past runs, newest last. Anything unreadable is treated as no runs rather than
 * breaking the menu.
 */
export function loadRuns(): RunRecord[] {
  const stored = localStorage.getItem(RUNS_KEY);
  if (stored === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const runs: RunRecord[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const run = entry as Record<string, unknown>;
    if (
      typeof run.map === 'string' &&
      typeof run.mode === 'string' &&
      typeof run.time === 'number' &&
      typeof run.targetsHit === 'number' &&
      typeof run.shots === 'number' &&
      typeof run.date === 'string'
    ) {
      runs.push({
        map: run.map,
        mode: run.mode,
        time: run.time,
        targetsHit: run.targetsHit,
        shots: run.shots,
        date: run.date,
      });
    }
  }
  return runs;
}

export function addRun(run: RunRecord): void {
  const runs = loadRuns();
  runs.push(run);
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

function defaultSelections(): Selections {
  const loadouts: Record<string, LoadoutSelection> = {};
  for (const slot of LOADOUT_SLOTS) {
    const attachments: Record<string, string> = {};
    for (const attachmentSlot of ATTACHMENT_SLOTS) {
      attachments[attachmentSlot.id] = ATTACHMENTS[attachmentSlot.id]?.[0]?.id ?? 'none';
    }
    loadouts[slot.id] = { weaponId: WEAPONS[0]?.id ?? 'm1911', attachments };
  }
  const skins: Record<string, string> = {};
  for (const group of SKINS) skins[group.id] = group.options[0]?.id ?? '';
  return {
    loadoutSlot: LOADOUT_SLOTS[0]?.id ?? 'slot-1',
    loadouts,
    skins,
    mapId: MAPS[0]?.id ?? 'shoot-house',
    modeId: MODES[0]?.id ?? 'targets',
    characterId: CHARACTERS[0]?.id ?? 'standard',
  };
}

function hasId(options: readonly { readonly id: string }[], id: unknown): id is string {
  return typeof id === 'string' && options.some((option) => option.id === id);
}

/** Saved selections, with anything missing or no longer in the data filled in. */
export function loadSelections(): Selections {
  const defaults = defaultSelections();
  const stored = localStorage.getItem(SELECTIONS_KEY);
  if (stored === null) return defaults;
  let parsed: Partial<Selections> | null;
  try {
    parsed = JSON.parse(stored) as Partial<Selections> | null;
  } catch {
    return defaults;
  }
  if (parsed === null || typeof parsed !== 'object') return defaults;

  const loadouts: Record<string, LoadoutSelection> = {};
  for (const slot of LOADOUT_SLOTS) {
    const fallback = defaults.loadouts[slot.id];
    if (fallback === undefined) continue;
    const saved = parsed.loadouts?.[slot.id];
    const weaponId = hasId(WEAPONS, saved?.weaponId) ? saved.weaponId : fallback.weaponId;
    const attachments: Record<string, string> = {};
    for (const attachmentSlot of ATTACHMENT_SLOTS) {
      const options = ATTACHMENTS[attachmentSlot.id] ?? [];
      const savedId = saved?.attachments[attachmentSlot.id];
      const fallbackId = fallback.attachments[attachmentSlot.id];
      attachments[attachmentSlot.id] = hasId(options, savedId)
        ? savedId
        : (fallbackId ?? options[0]?.id ?? 'none');
    }
    loadouts[slot.id] = { weaponId, attachments };
  }

  const skins: Record<string, string> = {};
  for (const group of SKINS) {
    const savedId = parsed.skins?.[group.id];
    skins[group.id] = hasId(group.options, savedId)
      ? savedId
      : (defaults.skins[group.id] ?? group.options[0]?.id ?? '');
  }

  return {
    loadoutSlot: hasId(LOADOUT_SLOTS, parsed.loadoutSlot)
      ? parsed.loadoutSlot
      : defaults.loadoutSlot,
    loadouts,
    skins,
    mapId: hasId(MAPS, parsed.mapId) ? parsed.mapId : defaults.mapId,
    modeId: hasId(MODES, parsed.modeId) ? parsed.modeId : defaults.modeId,
    characterId: hasId(CHARACTERS, parsed.characterId) ? parsed.characterId : defaults.characterId,
  };
}

export function saveSelections(selections: Selections): void {
  localStorage.setItem(SELECTIONS_KEY, JSON.stringify(selections));
}
