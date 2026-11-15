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
 * Heckler & Koch UMP45, .45 ACP. A slab-sided polymer receiver, straight 25-round
 * magazine, skeleton folding stock and a short barrel that barely clears the forend.
 * Built from reference/arsenal/br/heckler-koch-ump45-submachine-gun-side-p-1 and -2.
 */

function receiverShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.272, 0.05);
  s.lineTo(0.128, 0.05);
  s.lineTo(0.132, -0.01); // rear of the receiver, stock hinge
  s.lineTo(0.092, -0.03);
  s.lineTo(-0.108, -0.034); // trigger housing and magazine well floor
  s.lineTo(-0.118, -0.016);
  s.lineTo(-0.262, -0.012); // forend underside
  s.lineTo(-0.272, 0.0);
  s.closePath();
  return s;
}

function gripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.03, -0.03);
  s.lineTo(0.084, -0.03);
  s.lineTo(0.108, -0.128);
  s.lineTo(0.06, -0.134);
  s.lineTo(0.03, -0.052);
  s.closePath();
  return s;
}

function stockShape(): THREE.Shape {
  // Folding skeleton stock: top strut, butt, lower strut, open centre.
  const s = new THREE.Shape();
  s.moveTo(0.132, 0.046);
  s.lineTo(0.36, 0.03);
  s.lineTo(0.366, -0.092);
  s.lineTo(0.33, -0.096);
  s.lineTo(0.132, -0.008);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0.16, 0.028);
  hole.lineTo(0.338, 0.016);
  hole.lineTo(0.34, -0.072);
  hole.lineTo(0.168, 0.002);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

const GRIP_RAKE = -0.26;
const BORE_Y = 0.022;
const RAIL_Y = 0.05;

export function buildUmp45(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(receiverShape(), 0.044, 0.004, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripShape(), 0.03, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(stockShape(), 0.026, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.03, 0.126, 0.008], [0, -0.032, 0.367], [0.03, 0, 0]));

  // Trigger guard, trigger, ambidextrous selector, magazine release paddle.
  root.add(partBox('polymer-black', [0.014, 0.004, 0.062], [0, -0.062, -0.002]));
  root.add(partBox('polymer-black', [0.014, 0.03, 0.004], [0, -0.048, -0.032]));
  root.add(partBox('steel-dark', [0.006, 0.022, 0.005], [0, -0.044, -0.002], [0.2, 0, 0]));
  root.add(partBox('steel-dark', [0.05, 0.008, 0.02], [0, -0.012, 0.05], [0.3, 0, 0]));
  root.add(partBox('steel-dark', [0.012, 0.022, 0.006], [0, -0.046, -0.038], [0.2, 0, 0]));

  // Side reinforcement ribs, forend rails, cocking tube and handle on the left.
  root.add(partBox('polymer-black', [0.047, 0.006, 0.2], [0, 0.03, -0.02]));
  root.add(partBox('steel-dark', [0.048, 0.01, 0.07], [0, 0.012, -0.21]));
  root.add(partBox('steel-dark', [0.02, 0.006, 0.09], [0, -0.014, -0.2]));
  root.add(partBox('steel-dark', [0.014, 0.012, 0.018], [-0.028, 0.038, -0.19]));
  root.add(partBox('steel-dark', [0.003, 0.006, 0.13], [-0.0225, 0.038, -0.14]));
  buildPicatinnyRail(root, RAIL_Y, -0.2, 0.1, 'steel-dark');

  // Ejection port on the right with the bolt behind it.
  root.add(partBox('steel-dark', [0.004, 0.02, 0.06], [0.0215, 0.026, -0.05]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.008, 0.016, 0.056], [0.0185, 0.026, -0.05]));
  root.add(slide);

  // Short barrel and plain muzzle.
  root.add(barrelCyl('steel-dark', 0.0092, 0.0092, 0.04, [0, BORE_Y, -0.288], 16));
  root.add(barrelCyl('polymer-black', 0.0058, 0.0058, 0.004, [0, BORE_Y, -0.309], 12));

  let sightY = RAIL_Y + 0.03;
  let sightZ = 0.106;
  let aimDistance = 0.18;
  if (opticId === 'irons') {
    // Rear aperture between protective wings; hooded front post.
    root.add(partBox('steel-dark', [0.026, 0.01, 0.022], [0, RAIL_Y + 0.011, 0.108]));
    root.add(partBox('steel-dark', [0.004, 0.024, 0.02], [-0.011, RAIL_Y + 0.024, 0.108]));
    root.add(partBox('steel-dark', [0.004, 0.024, 0.02], [0.011, RAIL_Y + 0.024, 0.108]));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0046, 0.002, 8, 18),
      surface('steel-dark'),
    );
    ring.position.set(0, sightY, 0.108);
    root.add(ring);
    root.add(partBox('steel-dark', [0.02, 0.012, 0.022], [0, RAIL_Y + 0.006, -0.25]));
    const hood = new THREE.Mesh(
      new THREE.TorusGeometry(0.0105, 0.002, 8, 20),
      surface('steel-dark'),
    );
    hood.position.set(0, sightY - 0.002, -0.25);
    root.add(hood);
    root.add(partBox('steel-dark', [0.0022, 0.016, 0.0026], [0, sightY - 0.008, -0.25]));
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
      sightDotMaterial(0xf2f2ea),
    );
    tip.position.set(0, sightY - 0.0006, -0.25);
    root.add(tip);
  } else {
    root.add(partBox('steel-dark', [0.02, 0.012, 0.022], [0, RAIL_Y + 0.006, -0.25]));
    const mounted = buildMountedOptic(root, opticId, RAIL_Y + 0.006, -0.02);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Straight 25-round polymer magazine with a witness strip.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.03, -0.072);
  magazine.rotation.x = 0.07;
  magazine.add(partBox('polymer-black', [0.03, 0.2, 0.044], [0, -0.1, 0]));
  magazine.add(partBox('steel-dark', [0.0305, 0.15, 0.006], [0, -0.1, 0.012]));
  magazine.add(partBox('polymer-black', [0.034, 0.01, 0.05], [0, -0.203, 0]));
  root.add(magazine);

  const gripAnchor = anchor(root, [0, -0.086, 0.07], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.012, -0.044, -0.002]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.0, -0.2]);
  const magazineHand = anchor(magazine, [0, -0.13, 0], [0.06, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.312]);
  const ejection = anchor(root, [0.028, 0.03, -0.05]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.03, 0.05], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.046], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.2,
    slide,
    slideTravel: 0.05,
    action: 'slide',
    recoilProfile: 'smg',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.155, -0.155, -0.33),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.62, slideRelease: 0.84 },
  };
}
