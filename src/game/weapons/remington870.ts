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
 * Remington 870 Police Magnum / Tactical 12-gauge pump-action shotgun.
 * Twin-tube barrel + under-barrel magazine tube, matte black tactical stock, ghost-ring
 * rear sight with bright-orange front blade, and a moving ribbed pump forend (`slide`)
 * carrying the left support hand so cycling physically pumps the forend!
 * Built from reference/arsenal/13-remington870-side.jpg through 15.
 */

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Traditional shotgun swept wrist & Monte Carlo tactical buttstock in (z, y).
  s.moveTo(0.095, 0.02);
  s.lineTo(0.148, 0.01); // grip wrist crest
  s.lineTo(0.188, 0.012); // comb nose
  s.lineTo(0.375, -0.008); // comb top
  s.lineTo(0.382, -0.125); // rubber recoil pad face
  s.lineTo(0.33, -0.128); // toe
  s.lineTo(0.162, -0.072); // lower stock curve
  s.lineTo(0.118, -0.088); // semi-pistol grip pommel
  s.lineTo(0.084, -0.074); // grip front
  s.lineTo(0.074, -0.032); // receiver tang underside
  s.lineTo(0.095, -0.032);
  s.closePath();
  return s;
}

export function buildRemington870(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  // Solid milled steel receiver with rounded top crown (z: -0.095..0.10).
  root.add(partBox('gun-steel', [0.037, 0.056, 0.195], [0, 0.002, 0.002]));
  root.add(barrelCyl('gun-steel', 0.0185, 0.0185, 0.192, [0, 0.024, 0.002], 16));

  // Right-side ejection port + chrome/steel bolt face visible inside.
  root.add(partBox('polymer-black', [0.006, 0.018, 0.072], [0.017, 0.014, -0.016]));
  root.add(partBox('stainless-steel', [0.005, 0.016, 0.068], [0.0155, 0.014, -0.016]));

  // Trigger guard & curved trigger.
  root.add(partBox('polymer-black', [0.016, 0.004, 0.058], [0, -0.054, 0.032]));
  root.add(partBox('polymer-black', [0.016, 0.028, 0.005], [0, -0.04, 0.004]));
  root.add(partBox('polymer-black', [0.016, 0.028, 0.005], [0, -0.04, 0.062]));
  root.add(partBox('steel-dark', [0.006, 0.02, 0.005], [0, -0.04, 0.038], [0.22, 0, 0]));

  // Matte black synthetic shotgun stock + ribbed recoil pad.
  root.add(
    new THREE.Mesh(
      fromSideProfile(stockShape(), 0.035, 0.005, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.038, 0.122, 0.02], [0, -0.068, 0.388], [0.04, 0, 0]));

  // 18.5" heavy steel smoothbore barrel (top tube) + 6-round under-barrel magazine tube!
  root.add(barrelCyl('steel-dark', 0.0112, 0.0124, 0.475, [0, 0.024, -0.33], 18));
  root.add(barrelCyl('polymer-black', 0.0092, 0.0092, 0.004, [0, 0.024, -0.568], 14));
  // Tubular under-barrel magazine + knurled cap + front barrel-to-mag clamp.
  root.add(barrelCyl('gun-steel', 0.0124, 0.0124, 0.435, [0, -0.003, -0.31], 18));
  root.add(barrelCyl('steel-dark', 0.0138, 0.0138, 0.022, [0, -0.003, -0.534], 16));
  root.add(partBox('steel-dark', [0.028, 0.048, 0.022], [0, 0.01, -0.475]));

  // Ribbed black polymer PUMP FOREND (`slide`!) — carries `supportAnchor` so left hand pumps!
  const slide = new THREE.Group();
  slide.add(barrelCyl('polymer-black', 0.0225, 0.0235, 0.185, [0, -0.003, -0.265], 18));
  for (let i = 0; i < 8; i++) {
    const z = -0.342 + i * 0.022;
    slide.add(barrelCyl('glove', 0.0242, 0.0242, 0.008, [0, -0.003, z], 16));
  }
  // Dual action bars linking pump forend into receiver.
  slide.add(partBox('gun-steel', [0.004, 0.007, 0.14], [-0.017, -0.002, -0.145]));
  slide.add(partBox('gun-steel', [0.004, 0.007, 0.14], [0.017, -0.002, -0.145]));
  root.add(slide);

  // Ghost-ring rear aperture sight + bright orange-tipped winged front sight (sightY = 0.056).
  let sightY = 0.056;
  let sightZ = 0.056;
  let aimDistance = 0.17;
  if (opticId === 'irons') {
    root.add(partBox('steel-dark', [0.026, 0.008, 0.032], [0, 0.042, 0.052]));
    const ghostRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.0082, 0.0022, 10, 20),
      surface('steel-dark'),
    );
    ghostRing.position.set(0, sightY, 0.052);
    root.add(ghostRing);
    // Protective ears beside ghost ring.
    root.add(partBox('steel-dark', [0.003, 0.018, 0.016], [-0.012, sightY - 0.002, 0.052]));
    root.add(partBox('steel-dark', [0.003, 0.018, 0.016], [0.012, sightY - 0.002, 0.052]));
  } else {
    // Tactical receiver-top Picatinny optic rail + mounted reflex/holo optic.
    buildPicatinnyRail(root, 0.042, -0.072, 0.072, 'steel-dark');
    const mounted = buildMountedOptic(root, opticId, 0.048, -0.008);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Front ramp base + glowing international orange bead aligned to sightY = 0.056.
  root.add(partBox('steel-dark', [0.016, 0.016, 0.034], [0, 0.04, -0.542]));
  root.add(partBox('steel-dark', [0.0032, 0.014, 0.006], [0, 0.05, -0.546]));
  const orangeBead = new THREE.Mesh(
    new THREE.BoxGeometry(0.0042, 0.0042, 0.005),
    sightDotMaterial(0xff6b24),
  );
  orangeBead.position.set(0, 0.056, -0.546);
  root.add(orangeBead);

  // Loading-port 12-gauge red shotgun shell (`magazine` slides up into underside loading gate).
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.032, -0.035);
  const redShellMat = new THREE.MeshStandardMaterial({
    color: 0xa62620,
    roughness: 0.45,
    metalness: 0.05,
  });
  const brassBaseMat = new THREE.MeshStandardMaterial({
    color: 0xc29c45,
    roughness: 0.3,
    metalness: 0.85,
  });
  magazine.add(barrelCyl(redShellMat, 0.009, 0.009, 0.048, [0, 0, -0.006], 12));
  magazine.add(barrelCyl(brassBaseMat, 0.0096, 0.0096, 0.015, [0, 0, 0.022], 12));
  // Hide shell inside receiver until reload lowers it out.
  magazine.scale.setScalar(0.95);
  root.add(magazine);

  // Anchors — note `supportAnchor` is a child of `slide` so left hand pumps with the forend!
  const gripAnchor = anchor(root, [0, -0.042, 0.115], [-0.58, 0, 0]);
  const trigger = anchor(root, [0.012, -0.04, 0.038]);
  const supportAnchor = underHandguardAnchor(slide, [0, -0.003, -0.265]);
  const magazineHand = anchor(magazine, [0, -0.024, 0], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, 0.024, -0.572]);
  const ejection = anchor(root, [0.024, 0.016, -0.016]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.048, 0.048], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.12,
    slide,
    slideTravel: 0.072,
    action: 'pump',
    recoilProfile: 'shotgun',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.16, -0.155, -0.3),
      rotation: new THREE.Euler(0.016, -0.04, -0.022),
    },
    reload: { magazineOut: 0.18, magazineIn: 0.66, slideRelease: 0.86 },
  };
}
