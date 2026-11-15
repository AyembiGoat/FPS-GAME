import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  underHandguardAnchor,
} from './parts';

/**
 * Saiga-12, 12 gauge semi-automatic shotgun on the Kalashnikov action. Stamped receiver
 * and dust cover like the rifle, but with a fat smooth barrel, a gas block close to the
 * handguard, black polymer furniture and a short straight box magazine.
 * Built from reference/arsenal/br/saiga-12-shotgun-side-profile-isolated-1 and -3.
 */

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.108, 0.018);
  s.lineTo(0.35, -0.004);
  s.lineTo(0.356, -0.118);
  s.lineTo(0.3, -0.12);
  s.lineTo(0.108, -0.026);
  s.closePath();
  return s;
}

function gripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.04, -0.03);
  s.lineTo(0.078, -0.026);
  s.lineTo(0.11, -0.122);
  s.lineTo(0.068, -0.128);
  s.lineTo(0.036, -0.046);
  s.closePath();
  return s;
}

const GRIP_RAKE = -0.32;
const BORE_Y = 0.006;

export function buildSaiga12(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  // Stamped receiver, ribbed dust cover, selector lever.
  root.add(partBox('steel-dark', [0.038, 0.056, 0.22], [0, -0.008, 0.002]));
  root.add(barrelCyl('steel-dark', 0.019, 0.019, 0.21, [0, 0.02, 0.008], 16));
  root.add(partBox('gun-steel', [0.004, 0.014, 0.115], [0.021, 0.004, 0.018], [0.08, 0, 0]));

  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.008, 0.016, 0.086], [0.017, 0.016, -0.044]));
  slide.add(partBox('gun-steel', [0.022, 0.008, 0.012], [0.028, 0.018, -0.07], [0, 0, 0.15]));
  root.add(slide);

  // Trigger guard and trigger.
  root.add(partBox('steel-dark', [0.012, 0.003, 0.052], [0, -0.056, 0.012]));
  root.add(partBox('steel-dark', [0.012, 0.022, 0.004], [0, -0.046, 0.038]));
  root.add(partBox('gun-steel', [0.005, 0.02, 0.005], [0, -0.044, 0.014], [0.24, 0, 0]));
  root.add(partBox('steel-dark', [0.01, 0.026, 0.007], [0, -0.048, -0.016], [0.2, 0, 0]));

  // Black polymer grip, fixed stock with rubber pad.
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripShape(), 0.028, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(stockShape(), 0.036, 0.005, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.038, 0.118, 0.014], [0, -0.062, 0.362], [0.03, 0, 0]));

  // Ribbed polymer handguard, gas tube above it, gas block right at its front.
  root.add(partBox('polymer-black', [0.044, 0.044, 0.19], [0, -0.004, -0.205]));
  for (let i = 0; i < 6; i++) {
    root.add(partBox('glove', [0.046, 0.03, 0.006], [0, -0.008, -0.14 - i * 0.026]));
  }
  root.add(barrelCyl('steel-dark', 0.0105, 0.0105, 0.17, [0, 0.03, -0.2], 14));
  root.add(partBox('steel-dark', [0.024, 0.046, 0.034], [0, 0.016, -0.318]));

  // Fat 12 gauge barrel with a thread protector.
  root.add(barrelCyl('steel-dark', 0.0122, 0.0128, 0.34, [0, BORE_Y, -0.452], 18));
  root.add(barrelCyl('gun-steel', 0.014, 0.014, 0.022, [0, BORE_Y, -0.612], 16));
  root.add(barrelCyl('polymer-black', 0.0094, 0.0094, 0.004, [0, BORE_Y, -0.624], 14));

  // Low shotgun sights: a notch on the gas-block end of the cover and a bead up front.
  let sightY = 0.044;
  let sightZ = -0.1;
  // The eye sits well behind the receiver cover so the cover does not fill the view.
  let aimDistance = 0.34;
  root.add(partBox('steel-dark', [0.014, 0.024, 0.018], [0, 0.026, -0.56]));
  root.add(partBox('steel-dark', [0.0026, 0.012, 0.004], [0, 0.04, -0.56]));
  const bead = new THREE.Mesh(
    new THREE.BoxGeometry(0.0034, 0.0034, 0.004),
    sightDotMaterial(0xf2f2ea),
  );
  bead.position.set(0, 0.044, -0.56);
  root.add(bead);
  if (opticId === 'irons') {
    root.add(partBox('steel-dark', [0.026, 0.012, 0.03], [0, 0.034, -0.11]));
    root.add(partBox('steel-dark', [0.008, 0.01, 0.014], [-0.0062, 0.043, -0.104]));
    root.add(partBox('steel-dark', [0.008, 0.01, 0.014], [0.0062, 0.043, -0.104]));
  } else {
    // Side-rail bracket carrying a short top rail over the dust cover.
    root.add(partBox('steel-dark', [0.008, 0.018, 0.092], [-0.022, -0.002, 0.012]));
    root.add(partBox('steel-dark', [0.008, 0.058, 0.048], [-0.024, 0.024, 0.008]));
    root.add(partBox('steel-dark', [0.028, 0.008, 0.056], [-0.013, 0.05, 0.006]));
    buildPicatinnyRail(root, 0.05, -0.072, 0.088, 'steel-dark');
    const mounted = buildMountedOptic(root, opticId, 0.056, 0.002);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Straight 5-round polymer box magazine, raked forward.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.034, -0.062);
  magazine.rotation.x = 0.2;
  magazine.add(partBox('polymer-black', [0.036, 0.11, 0.074], [0, -0.055, 0]));
  for (let i = 0; i < 3; i++) {
    magazine.add(partBox('glove', [0.0375, 0.004, 0.066], [0, -0.03 - i * 0.026, 0]));
  }
  magazine.add(partBox('polymer-black', [0.04, 0.008, 0.08], [0, -0.112, 0]));
  root.add(magazine);

  const gripAnchor = anchor(root, [0, -0.08, 0.074], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.011, -0.044, 0.014]);
  const supportAnchor = underHandguardAnchor(root, [0, -0.008, -0.21]);
  const magazineHand = anchor(magazine, [0, -0.07, 0], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.628]);
  const ejection = anchor(root, [0.024, 0.018, -0.044]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.028, 0.044], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.048, 0.048], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.15,
    slide,
    slideTravel: 0.07,
    action: 'slide',
    recoilProfile: 'shotgun',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.16, -0.158, -0.29),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.64, slideRelease: 0.85 },
  };
}
