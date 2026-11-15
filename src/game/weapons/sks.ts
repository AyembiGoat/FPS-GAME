import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  addSportingTriggerGuard,
  anchor,
  barrelCyl,
  brassMaterial,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  sportingGripAnchors,
  sportingStockShape,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * Simonov SKS, 7.62×39mm semi-automatic carbine. One-piece wooden stock, wooden gas-tube
 * cover, fixed ten-round magazine under the action, hooded front sight and the blade
 * bayonet folded back under the barrel. Reloaded from the top with a stripper clip.
 * Built from reference/arsenal/br/sks-rifle-7-62x39-side-profile-wood-stoc-3 and -1.
 */

const BORE_Y = 0.024;
const SIGHT_Y = 0.064;

export function buildSKS(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(
        sportingStockShape({ forendTip: -0.34, forendDepth: -0.022, buttZ: 0.4, wrist: 'pistol' }),
        0.04,
        0.007,
        'ak-wood',
      ),
      surface('ak-wood'),
    ),
  );
  root.add(partBox('steel-dark', [0.04, 0.118, 0.006], [0, -0.066, 0.402], [0.02, 0, 0]));
  addSportingTriggerGuard(root);

  // Milled receiver with the rounded cover over its rear half.
  root.add(partBox('steel-dark', [0.034, 0.03, 0.2], [0, 0.015, 0.0]));
  root.add(barrelCyl('steel-dark', 0.0165, 0.0165, 0.1, [0, 0.03, 0.05], 16));
  root.add(partBox('steel-dark', [0.012, 0.012, 0.012], [0.02, 0.012, 0.094]));

  // Bolt carrier riding on top of the open front half, charging handle on the right.
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.026, 0.02, 0.092], [0, 0.036, -0.048]));
  slide.add(
    uprightCyl('gun-steel', 0.006, 0.006, 0.022, [0.022, 0.036, -0.03], [0, 0, Math.PI / 2], 10),
  );
  root.add(slide);

  // Fixed magazine belly, hinged at the front.
  root.add(partBox('steel-dark', [0.028, 0.03, 0.118], [0, -0.04, -0.086], [-0.1, 0, 0]));
  root.add(partBox('steel-dark', [0.03, 0.008, 0.012], [0, -0.03, -0.022]));

  // Rear tangent sight on the chamber, wooden gas-tube cover, gas block.
  root.add(partBox('steel-dark', [0.026, 0.02, 0.05], [0, 0.046, -0.13]));
  root.add(barrelCyl('ak-wood', 0.0148, 0.0158, 0.16, [0, 0.05, -0.238], 14));
  root.add(barrelCyl('steel-dark', 0.0088, 0.0088, 0.03, [0, 0.05, -0.332], 12));
  root.add(partBox('steel-dark', [0.022, 0.044, 0.03], [0, 0.036, -0.352]));
  root.add(partBox('steel-dark', [0.042, 0.03, 0.014], [0, -0.008, -0.338]));

  // Barrel, hooded front sight, bayonet mount.
  root.add(barrelCyl('steel-dark', 0.0078, 0.0092, 0.52, [0, BORE_Y, -0.36], 16));
  root.add(barrelCyl('polymer-black', 0.0046, 0.0046, 0.004, [0, BORE_Y, -0.621], 12));
  root.add(partBox('steel-dark', [0.014, 0.03, 0.03], [0, BORE_Y + 0.018, -0.576]));
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.002, 8, 20), surface('steel-dark'));
  hood.position.set(0, SIGHT_Y - 0.002, -0.576);
  root.add(hood);
  root.add(partBox('steel-dark', [0.0022, 0.014, 0.0026], [0, SIGHT_Y - 0.007, -0.576]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0006, -0.576);
  root.add(tip);
  // Folded blade bayonet lying under the barrel, point toward the forend.
  root.add(partBox('steel-dark', [0.016, 0.024, 0.03], [0, BORE_Y - 0.016, -0.566]));
  root.add(partBox('stainless-steel', [0.004, 0.016, 0.21], [0, BORE_Y - 0.024, -0.448]));
  root.add(barrelCyl('steel-dark', 0.0026, 0.0026, 0.2, [0, -0.012, -0.44], 8));

  let sightY = SIGHT_Y;
  let sightZ = -0.118;
  // The eye sits well behind the receiver cover so the cover does not fill the view.
  let aimDistance = 0.31;
  if (opticId === 'irons') {
    root.add(partBox('steel-dark', [0.008, 0.012, 0.014], [-0.0062, SIGHT_Y - 0.004, -0.112]));
    root.add(partBox('steel-dark', [0.008, 0.012, 0.014], [0.0062, SIGHT_Y - 0.004, -0.112]));
    root.add(partBox('steel-dark', [0.02, 0.004, 0.04], [0, SIGHT_Y - 0.01, -0.126], [0.06, 0, 0]));
  } else {
    // Receiver-cover rail.
    buildPicatinnyRail(root, 0.046, -0.02, 0.1, 'steel-dark');
    const mounted = buildMountedOptic(root, opticId, 0.052, 0.03);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Ten rounds on a stripper clip, pressed down into the open action during a reload.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.006, -0.05);
  const brass = brassMaterial();
  for (let i = 0; i < 5; i++) {
    magazine.add(barrelCyl(brass, 0.004, 0.0056, 0.05, [0, -0.02 + i * 0.011, 0], 8));
  }
  magazine.add(partBox('gun-steel', [0.004, 0.058, 0.008], [0, 0.002, 0.026]));
  root.add(magazine);

  const hands = sportingGripAnchors(root, 'pistol');
  const supportAnchor = underHandguardAnchor(root, [0, -0.01, -0.24]);
  const magazineHand = anchor(magazine, [0, 0.0, 0.02], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.624]);
  const ejection = anchor(root, [0.02, 0.04, -0.05]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: hands.grip, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger: hands.trigger,
    support: { anchor: supportAnchor, size: [0.044, 0.046], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: -0.085,
    slide,
    slideTravel: 0.07,
    action: 'slide',
    recoilProfile: 'heavy-rifle',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.16, -0.156, -0.27),
      rotation: new THREE.Euler(0.016, -0.04, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.66, slideRelease: 0.86 },
  };
}
