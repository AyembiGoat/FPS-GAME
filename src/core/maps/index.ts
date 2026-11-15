import type { GameMap, MapId } from '../map';
import { cargoYard } from './cargoYard';
import { shootHouse } from './shootHouse';

export const MAPS: Readonly<Record<MapId, GameMap>> = {
  'shoot-house': shootHouse,
  'cargo-yard': cargoYard,
};

export const MAP_LIST: readonly GameMap[] = [shootHouse, cargoYard];

export const DEFAULT_MAP_ID: MapId = 'shoot-house';

export function isMapId(value: string | null | undefined): value is MapId {
  return value === 'shoot-house' || value === 'cargo-yard';
}

export function getMapById(id: MapId): GameMap {
  return MAPS[id];
}

export { cargoYard, shootHouse };
