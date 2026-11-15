import type { GameMap, MapId } from '../map';
import { cargoYard } from './cargoYard';
import { shootHouse } from './shootHouse';
import { testDummyRange } from './testDummyRange';

export const MAPS: Readonly<Record<MapId, GameMap>> = {
  'shoot-house': shootHouse,
  'cargo-yard': cargoYard,
  'test-dummy-range': testDummyRange,
};

/** Maps a player can choose. The dummy-range test fixture is deliberately left out. */
export const MAP_LIST: readonly GameMap[] = [shootHouse, cargoYard];

export const DEFAULT_MAP_ID: MapId = 'shoot-house';

/** True for player-selectable map ids only; the test fixture id is rejected. */
export function isMapId(value: string | null | undefined): value is MapId {
  return value === 'shoot-house' || value === 'cargo-yard';
}

export function getMapById(id: MapId): GameMap {
  return MAPS[id];
}

export { cargoYard, shootHouse };
