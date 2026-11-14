import type { WeaponId, WeaponSpec } from '../../core/weapon';
import { buildAK47 } from './ak47';
import { buildAWM } from './awm';
import { buildDesertEagle } from './desertEagle';
import { buildHK416 } from './hk416';
import { buildM1911 } from './m1911';
import type { WeaponModel } from './model';
import { buildMP5 } from './mp5';
import { buildRemington870 } from './remington870';
import { buildScarH } from './scarH';

/** The 3D procedural model for each firearm, keyed by its WeaponId. */
const BUILDERS: Record<WeaponId, () => WeaponModel> = {
  hk416: buildHK416,
  ak47: buildAK47,
  'scar-h': buildScarH,
  mp5: buildMP5,
  'remington-870': buildRemington870,
  awm: buildAWM,
  m1911: buildM1911,
  'desert-eagle': buildDesertEagle,
};

export function buildWeaponModel(spec: WeaponSpec): WeaponModel {
  return BUILDERS[spec.id]();
}
