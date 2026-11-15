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
 * KRISS Vector Gen II SMG, .45 ACP. The barrel sits low, level with the firing hand, and
 * the housing in front of the trigger drops well below it to hold the Super V bolt and
 * the Glock-pattern magazine. Flat top rail, flip-up sights, folding stock.
 * Built from reference/arsenal/br/kriss-vector-gen-ii-smg-45-acp-side-prof-1 and -2.
 */

function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.192, 0.05);
  s.lineTo(0.126, 0.05);
  s.lineTo(0.13, -0.004);
  s.lineTo(0.1, -0.018); // above the grip
  s.lineTo(-0.036, -0.018);
  s.lineTo(-0.04, -0.118); // rear of the lower housing, magazine well mouth
  s.lineTo(-0.108, -0.118);
  s.lineTo(-0.116, -0.098); // hand rest ahead of the magazine
  s.lineTo(-0.178, -0.092);
  s.lineTo(-0.206, -0.05); // sloped nose
  s.lineTo(-0.206, 0.03);
  s.closePath();
  return s;
}

function gripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.032, -0.018);
  s.lineTo(0.09, -0.018);
  s.lineTo(0.112, -0.126);
  s.lineTo(0.062, -0.132);
  s.lineTo(0.032, -0.05);
  s.closePath();
  return s;
}

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.13, 0.044);
  s.lineTo(0.35, 0.044);
  s.lineTo(0.356, -0.09);
  s.lineTo(0.31, -0.094);
  s.lineTo(0.196, -0.012);
  s.lineTo(0.13, -0.006);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0.21, 0.024);
  hole.lineTo(0.326, 0.024);
  hole.lineTo(0.328, -0.066);
  hole.lineTo(0.302, -0.066);
  hole.lineTo(0.214, 0.0);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

const GRIP_RAKE = -0.25;
const BORE_Y = -0.004;
const RAIL_Y = 0.05;

export function buildVector(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(bodyShape(), 0.046, 0.005, 'polymer-black'),
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
      fromSideProfile(stockShape(), 0.03, 0.004, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.034, 0.136, 0.008], [0, -0.024, 0.358], [0.02, 0, 0]));
  root.add(barrelCyl('steel-dark', 0.012, 0.012, 0.012, [0.012, 0.02, 0.132], 12));

  // Trigger guard bow joining the housing to the grip, trigger, selector, bolt release.
  root.add(partBox('polymer-black', [0.014, 0.004, 0.07], [0, -0.062, -0.002]));
  root.add(partBox('steel-dark', [0.006, 0.024, 0.005], [0, -0.04, 0.002], [0.2, 0, 0]));
  root.add(partBox('steel-dark', [0.05, 0.008, 0.018], [0, -0.004, 0.06], [0.3, 0, 0]));
  root.add(partBox('steel-dark', [0.049, 0.012, 0.022], [0, 0.012, -0.012]));

  // Steel upper with the full-length rail, charging handle on the left, side seams.
  buildPicatinnyRail(root, RAIL_Y, -0.188, 0.122, 'steel-dark');
  root.add(partBox('steel-dark', [0.012, 0.01, 0.03], [-0.028, 0.03, -0.13]));
  root.add(partBox('steel-dark', [0.048, 0.003, 0.3], [0, 0.022, -0.036]));
  root.add(partBox('steel-dark', [0.048, 0.05, 0.003], [0, -0.07, -0.112], [0.25, 0, 0]));
  root.add(partBox('steel-dark', [0.02, 0.006, 0.05], [0, -0.096, -0.15]));

  // Ejection port on the right with the bolt behind it.
  root.add(partBox('steel-dark', [0.004, 0.02, 0.05], [0.0225, 0.004, -0.072]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.008, 0.016, 0.046], [0.0195, 0.004, -0.072]));
  root.add(slide);

  // Low barrel with a thread protector, just proud of the nose.
  root.add(barrelCyl('steel-dark', 0.0098, 0.0098, 0.03, [0, BORE_Y, -0.218], 16));
  root.add(barrelCyl('polymer-black', 0.0058, 0.0058, 0.004, [0, BORE_Y, -0.234], 12));

  let sightY = RAIL_Y + 0.03;
  let sightZ = 0.1;
  let aimDistance = 0.18;
  if (opticId === 'irons') {
    root.add(partBox('steel-dark', [0.022, 0.01, 0.026], [0, RAIL_Y + 0.011, 0.102]));
    root.add(partBox('steel-dark', [0.004, 0.022, 0.008], [-0.008, RAIL_Y + 0.025, 0.102]));
    root.add(partBox('steel-dark', [0.004, 0.022, 0.008], [0.008, RAIL_Y + 0.025, 0.102]));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0046, 0.002, 8, 18),
      surface('steel-dark'),
    );
    ring.position.set(0, sightY, 0.102);
    root.add(ring);
    root.add(partBox('steel-dark', [0.022, 0.01, 0.026], [0, RAIL_Y + 0.011, -0.17]));
    root.add(partBox('steel-dark', [0.003, 0.026, 0.01], [-0.008, RAIL_Y + 0.026, -0.17]));
    root.add(partBox('steel-dark', [0.003, 0.026, 0.01], [0.008, RAIL_Y + 0.026, -0.17]));
    root.add(partBox('steel-dark', [0.0022, 0.02, 0.0026], [0, RAIL_Y + 0.02, -0.17]));
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
      sightDotMaterial(0xf2f2ea),
    );
    tip.position.set(0, sightY - 0.0006, -0.17);
    root.add(tip);
  } else {
    const mounted = buildMountedOptic(root, opticId, RAIL_Y + 0.006, -0.02);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // Glock-pattern 25-round magazine with its extended base, raked like a pistol grip.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.11, -0.07);
  magazine.rotation.x = -0.16;
  magazine.add(partBox('polymer-black', [0.026, 0.15, 0.036], [0, -0.03, 0]));
  magazine.add(partBox('polymer-black', [0.03, 0.03, 0.042], [0, -0.112, 0]));
  root.add(magazine);

  const gripAnchor = anchor(root, [0, -0.082, 0.074], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.012, -0.04, 0.002]);
  const supportAnchor = underHandguardAnchor(root, [0, -0.082, -0.15]);
  const magazineHand = anchor(magazine, [0, -0.08, 0], [0.04, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.237]);
  const ejection = anchor(root, [0.029, 0.008, -0.072]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.03, 0.05], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.048, 0.05], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.17,
    slide,
    slideTravel: 0.04,
    action: 'slide',
    recoilProfile: 'smg',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.15, -0.15, -0.36),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.62, slideRelease: 0.84 },
  };
}
