import { M1911 } from '../../core/weapon';
import type { WeaponSpec } from '../../core/weapon';
import { buildM1911 } from './m1911';
import type { WeaponModel } from './model';

/** The model for each gun, by the name in its WeaponSpec. Register new guns here. */
const BUILDERS: Record<string, () => WeaponModel> = {
  [M1911.name]: buildM1911,
};

export function buildWeaponModel(spec: WeaponSpec): WeaponModel {
  const build = BUILDERS[spec.name];
  if (!build) throw new Error(`No model registered for ${spec.name} in src/game/weapons/index.ts`);
  return build();
}
