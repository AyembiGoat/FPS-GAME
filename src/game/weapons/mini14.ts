import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  addSportingTriggerGuard,
  anchor,
  barrelCyl,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  sportingGripAnchors,
  sportingStockShape,
  underHandguardAnchor,
} from './parts';

/**
 * Ruger Mini-14 Ranch Rifle, 5.56×45mm. A scaled-down Garand action in a hardwood stock:
 * black handguard over the barrel, operating rod and handle on the right, ghost-ring rear
 * sight, winged front blade and a 20-round steel magazine.
 * Built from reference/arsenal/br/ruger-mini-14-ranch-rifle-side-profile-w-1 and -4.
 */

const BORE_Y = 0.024;
const SIGHT_Y = 0.062;

export function buildMini14(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(
        sportingStockShape({ forendTip: -0.3, forendDepth: -0.02, buttZ: 0.39, wrist: 'pistol' }),
        0.042,
        0.008,
        'rifle-walnut',
      ),
      surface('rifle-walnut'),
    ),
  );
  root.add(partBox('glove', [0.042, 0.118, 0.012], [0, -0.066, 0.394], [0.02, 0, 0]));
  addSportingTriggerGuard(root);

  // Receiver with integral scope bases and the rear sight wings.
  root.add(partBox('gun-steel', [0.034, 0.034, 0.2], [0, 0.017, 0.0]));
  root.add(partBox('gun-steel', [0.03, 0.01, 0.04], [0, 0.038, 0.07]));

  // Operating rod along the right side with its curled handle (`slide`), bolt in the port.
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.006, 0.012, 0.19], [0.021, 0.014, -0.13]));
  slide.add(partBox('gun-steel', [0.016, 0.012, 0.016], [0.028, 0.022, -0.03]));
  slide.add(partBox('stainless-steel', [0.02, 0.012, 0.07], [0.004, 0.034, -0.03]));
  root.add(slide);

  // Black handguard over the barrel, gas block at the forend tip.
  root.add(barrelCyl('polymer-black', 0.0185, 0.021, 0.2, [0, BORE_Y + 0.004, -0.2], 16));
  root.add(partBox('steel-dark', [0.036, 0.042, 0.034], [0, BORE_Y - 0.012, -0.318]));

  // 18.5-inch barrel, front blade between two wings.
  root.add(barrelCyl('gun-steel', 0.0082, 0.0094, 0.3, [0, BORE_Y, -0.45], 16));
  root.add(barrelCyl('polymer-black', 0.0048, 0.0048, 0.004, [0, BORE_Y, -0.601], 12));
  root.add(partBox('gun-steel', [0.02, 0.02, 0.026], [0, BORE_Y + 0.012, -0.572]));
  root.add(partBox('gun-steel', [0.003, 0.02, 0.016], [-0.0085, SIGHT_Y - 0.006, -0.572]));
  root.add(partBox('gun-steel', [0.003, 0.02, 0.016], [0.0085, SIGHT_Y - 0.006, -0.572]));
  root.add(partBox('gun-steel', [0.0022, 0.018, 0.0026], [0, SIGHT_Y - 0.009, -0.572]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0006, -0.572);
  root.add(tip);

  let sightY = SIGHT_Y;
  let sightZ = 0.084;
  let aimDistance = 0.17;
  if (opticId === 'irons') {
    root.add(partBox('gun-steel', [0.004, 0.026, 0.02], [-0.012, 0.054, 0.082]));
    root.add(partBox('gun-steel', [0.004, 0.026, 0.02], [0.012, 0.054, 0.082]));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0056, 0.0022, 8, 18),
      surface('steel-dark'),
    );
    ring.position.set(0, SIGHT_Y, 0.082);
    root.add(ring);
  } else {
    buildPicatinnyRail(root, 0.043, -0.09, 0.09, 'gun-steel');
    const mounted = buildMountedOptic(root, opticId, 0.049, -0.006);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // 20-round blued steel magazine, rocked in at a slight forward rake.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.026, -0.05);
  magazine.rotation.x = 0.14;
  magazine.add(partBox('steel-dark', [0.024, 0.118, 0.062], [0, -0.059, 0]));
  magazine.add(partBox('steel-dark', [0.0245, 0.09, 0.004], [0, -0.06, 0.016]));
  magazine.add(partBox('gun-steel', [0.027, 0.006, 0.066], [0, -0.12, 0]));
  root.add(magazine);

  const hands = sportingGripAnchors(root, 'pistol');
  const supportAnchor = underHandguardAnchor(root, [0, -0.008, -0.22]);
  const magazineHand = anchor(magazine, [0, -0.075, 0], [0.08, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.604]);
  const ejection = anchor(root, [0.022, 0.036, -0.03]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: hands.grip, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger: hands.trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.046], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.15,
    slide,
    slideTravel: 0.06,
    action: 'slide',
    recoilProfile: 'carbine',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.16, -0.156, -0.28),
      rotation: new THREE.Euler(0.016, -0.04, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.62, slideRelease: 0.85 },
  };
}
