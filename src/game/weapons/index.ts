import type { OpticId, WeaponId, WeaponSpec } from '../../core/weapon';
import { clampWeaponOptic } from '../../core/weapon';
import { buildAK47 } from './ak47';
import { buildAugA3 } from './augA3';
import { buildAWM } from './awm';
import { buildBeretta92FS } from './beretta92fs';
import { buildDesertEagle } from './desertEagle';
import { buildDP28 } from './dp28';
import { buildHK416 } from './hk416';
import { buildKar98k } from './kar98k';
import { buildM16A4 } from './m16a4';
import { buildM1911 } from './m1911';
import { buildMini14 } from './mini14';
import type { WeaponModel } from './model';
import { buildMosinNagant } from './mosinNagant';
import { buildMP5 } from './mp5';
import { finalizeWeaponModel } from './parts';
import { buildRemington870 } from './remington870';
import { buildSaiga12 } from './saiga12';
import { buildScarH } from './scarH';
import { buildSKS } from './sks';
import { buildUmp45 } from './ump45';
import { buildVector } from './vector';

/** The 3D procedural model for each firearm, keyed by its WeaponId. */
const BUILDERS: Record<WeaponId, (opticId: OpticId) => WeaponModel> = {
  hk416: buildHK416,
  ak47: buildAK47,
  'scar-h': buildScarH,
  mp5: buildMP5,
  'remington-870': buildRemington870,
  awm: buildAWM,
  m1911: buildM1911,
  'desert-eagle': buildDesertEagle,
  m16a4: buildM16A4,
  'aug-a3': buildAugA3,
  ump45: buildUmp45,
  vector: buildVector,
  'saiga-12': buildSaiga12,
  sks: buildSKS,
  'mini-14': buildMini14,
  kar98k: buildKar98k,
  'mosin-nagant': buildMosinNagant,
  'dp-28': buildDP28,
  'beretta-92fs': buildBeretta92FS,
};

export function buildWeaponModel(spec: WeaponSpec, opticId?: OpticId): WeaponModel {
  const resolved = clampWeaponOptic(spec.id, opticId);
  return finalizeWeaponModel(BUILDERS[spec.id](resolved));
}
