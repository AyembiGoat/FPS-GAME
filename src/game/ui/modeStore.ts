import type { MapId } from '../../core/map';
import { DEFAULT_MAP_ID, isMapId } from '../../core/maps';
import type { GameModeId } from '../../core/modes';
import { DEFAULT_GAME_MODE, isGameModeId } from '../../core/modes';

const MODE_STORAGE_KEY = 'fps.mode.v2';
const MAP_STORAGE_KEY = 'fps.map.v1';

export interface OperationSelection {
  readonly mode: GameModeId;
  readonly mapId: MapId;
}

export function createModeStore(initialModeOverride?: GameModeId, initialMapOverride?: MapId) {
  let currentMode: GameModeId = initialModeOverride ?? DEFAULT_GAME_MODE;
  let currentMap: MapId = initialMapOverride ?? DEFAULT_MAP_ID;

  if (!initialModeOverride) {
    try {
      const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (savedMode && isGameModeId(savedMode)) {
        currentMode = savedMode;
      }
    } catch {
      currentMode = DEFAULT_GAME_MODE;
    }
  }

  if (!initialMapOverride) {
    try {
      const savedMap = window.localStorage.getItem(MAP_STORAGE_KEY);
      if (savedMap && isMapId(savedMap)) {
        currentMap = savedMap;
      }
    } catch {
      currentMap = DEFAULT_MAP_ID;
    }
  }

  const listeners = new Set<(selection: OperationSelection) => void>();

  function persist() {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, currentMode);
      window.localStorage.setItem(MAP_STORAGE_KEY, currentMap);
    } catch {
      // Storage unavailable; keep active selection in memory.
    }
  }

  function snapshot(): OperationSelection {
    return { mode: currentMode, mapId: currentMap };
  }

  function notify() {
    const snap = snapshot();
    for (const listener of listeners) {
      listener(snap);
    }
  }

  return {
    get(): GameModeId {
      return currentMode;
    },
    getMap(): MapId {
      return currentMap;
    },
    getSelection(): OperationSelection {
      return snapshot();
    },
    set(nextMode: GameModeId) {
      if (!isGameModeId(nextMode) || nextMode === currentMode) return;
      currentMode = nextMode;
      persist();
      notify();
    },
    setMap(nextMap: MapId) {
      if (!isMapId(nextMap) || nextMap === currentMap) return;
      currentMap = nextMap;
      persist();
      notify();
    },
    setSelection(nextMode: GameModeId, nextMap: MapId) {
      const modeChanged = isGameModeId(nextMode) && nextMode !== currentMode;
      const mapChanged = isMapId(nextMap) && nextMap !== currentMap;
      if (!modeChanged && !mapChanged) return;
      if (isGameModeId(nextMode)) currentMode = nextMode;
      if (isMapId(nextMap)) currentMap = nextMap;
      persist();
      notify();
    },
    subscribe(listener: (selection: OperationSelection) => void): () => void {
      listeners.add(listener);
      listener(snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ModeStore = ReturnType<typeof createModeStore>;
