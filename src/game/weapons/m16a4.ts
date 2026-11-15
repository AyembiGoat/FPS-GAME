import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildCurvedMagazine,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * Colt M16A4, 5.56×45mm, 20-inch barrel, three-round burst.
 * Fixed A2 stock, round ribbed handguards, triangular front sight base and a detachable
 * carry handle on the flat-top receiver; the handle comes off when an optic goes on.
 * Built from reference/arsenal/br/colt-m16a4-rifle-left-side-profile-white-1 and -2.
 */

function lowerReceiverShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.092, 0.002);
  s.lineTo(0.112, 0.002);
  s.lineTo(0.112, -0.018); // buffer tower
  s.lineTo(0.08, -0.034);
  s.lineTo(0.03, -0.036);
  s.lineTo(0.03, -0.046); // trigger guard bar
  s.lineTo(-0.03, -0.046);
  s.lineTo(-0.034, -0.062); // magazine well
  s.lineTo(-0.09, -0.056);
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.026, -0.016);
  guard.lineTo(0.026, -0.016);
  guard.lineTo(0.026, -0.042);
  guard.lineTo(-0.026, -0.042);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  // A2 fixed stock: straight comb in line with the bore, underside falling to the toe.
  s.moveTo(0.112, 0.03);
  s.lineTo(0.384, 0.03);
  s.lineTo(0.388, -0.094);
  s.lineTo(0.34, -0.1);
  s.lineTo(0.112, -0.016);
  s.closePath();
  return s;
}

function pistolGripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.032, -0.036);
  s.lineTo(0.078, -0.032);
  s.lineTo(0.104, -0.124);
  s.lineTo(0.06, -0.13);
  s.lineTo(0.046, -0.086);
  s.lineTo(0.038, -0.084); // A2 finger rest
  s.lineTo(0.03, -0.056);
  s.closePath();
  return s;
}

function frontSightShape(): THREE.Shape {
  // The triangular "A-frame" front sight base in (z, y), with the open centre.
  const s = new THREE.Shape();
  s.moveTo(-0.424, 0.006);
  s.lineTo(-0.376, 0.006);
  s.lineTo(-0.392, 0.07);
  s.lineTo(-0.408, 0.07);
  s.closePath();
  const gap = new THREE.Path();
  gap.moveTo(-0.413, 0.032);
  gap.lineTo(-0.387, 0.032);
  gap.lineTo(-0.395, 0.058);
  gap.lineTo(-0.405, 0.058);
  gap.closePath();
  s.holes.push(gap);
  return s;
}

const GRIP_RAKE = -0.3;
const SIGHT_Y = 0.084;

export function buildM16A4(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(lowerReceiverShape(), 0.032, 0.002, 'gun-steel'),
      surface('gun-steel'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(pistolGripShape(), 0.029, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('steel-dark', [0.006, 0.02, 0.005], [0, -0.029, -0.002], [0.22, 0, 0]));
  root.add(partBox('steel-dark', [0.038, 0.007, 0.014], [0, -0.012, 0.036]));

  // Flat-top upper receiver, forward assist, case deflector, charging handle.
  root.add(partBox('gun-steel', [0.034, 0.04, 0.2], [0, 0.021, 0.008]));
  root.add(partBox('gun-steel', [0.012, 0.018, 0.016], [0.021, 0.022, 0.04], [0, 0.35, 0]));
  root.add(
    uprightCyl(
      'steel-dark',
      0.0065,
      0.0065,
      0.022,
      [0.023, 0.014, 0.072],
      [0.4, 0, -Math.PI / 2],
      12,
    ),
  );
  root.add(partBox('steel-dark', [0.04, 0.008, 0.018], [0, 0.034, 0.114]));
  buildPicatinnyRail(root, 0.041, -0.088, 0.102, 'gun-steel');

  // Ejection port with the bolt carrier showing through.
  root.add(partBox('steel-dark', [0.005, 0.016, 0.064], [0.016, 0.022, -0.012]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.013, 0.014, 0.062], [0.0105, 0.022, -0.012]));
  root.add(slide);

  // Delta ring, round ribbed A2 handguards, handguard cap.
  root.add(barrelCyl('gun-steel', 0.0265, 0.0245, 0.022, [0, 0.018, -0.103], 20));
  root.add(barrelCyl('polymer-black', 0.0235, 0.027, 0.262, [0, 0.018, -0.245], 20));
  for (let i = 0; i < 13; i++) {
    const z = -0.132 - i * 0.019;
    const r = 0.0278 - i * 0.00027;
    root.add(barrelCyl('polymer-black', r, r, 0.008, [0, 0.018, z], 20));
  }
  root.add(barrelCyl('steel-dark', 0.022, 0.022, 0.006, [0, 0.018, -0.378], 16));

  // Front sight base, 20-inch government-profile barrel, bayonet lug, birdcage flash hider.
  root.add(
    new THREE.Mesh(
      fromSideProfile(frontSightShape(), 0.014, 0.001, 'steel-dark'),
      surface('steel-dark'),
    ),
  );
  root.add(partBox('steel-dark', [0.008, 0.01, 0.022], [0, 0.002, -0.416]));
  root.add(barrelCyl('steel-dark', 0.0088, 0.0096, 0.24, [0, 0.018, -0.49], 16));
  root.add(barrelCyl('steel-dark', 0.0108, 0.0108, 0.042, [0, 0.018, -0.607], 14));
  root.add(barrelCyl('polymer-black', 0.0052, 0.0052, 0.004, [0, 0.018, -0.629], 12));
  // Front post and its two protective ears.
  root.add(partBox('steel-dark', [0.003, 0.016, 0.01], [-0.0075, 0.077, -0.4]));
  root.add(partBox('steel-dark', [0.003, 0.016, 0.01], [0.0075, 0.077, -0.4]));
  root.add(partBox('steel-dark', [0.0022, 0.014, 0.0026], [0, 0.077, -0.4]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0006, -0.4);
  root.add(tip);

  // Receiver extension inside the fixed A2 stock, rubber butt plate.
  root.add(
    new THREE.Mesh(
      fromSideProfile(stockShape(), 0.036, 0.005, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.037, 0.128, 0.008], [0, -0.034, 0.39], [0.03, 0, 0]));

  let sightY = SIGHT_Y;
  let sightZ = 0.07;
  let aimDistance = 0.17;
  if (opticId === 'irons') {
    // Detachable carry handle: two feet, the grip bar and the A2 rear sight housing.
    root.add(partBox('gun-steel', [0.024, 0.026, 0.03], [0, 0.06, -0.062]));
    root.add(partBox('gun-steel', [0.03, 0.022, 0.058], [0, 0.058, 0.07]));
    root.add(partBox('gun-steel', [0.02, 0.008, 0.15], [0, 0.076, -0.004], [-0.03, 0, 0]));
    // Rear sight: aperture between two ears, windage knob on the right.
    root.add(partBox('gun-steel', [0.004, 0.024, 0.03], [-0.011, 0.08, 0.078]));
    root.add(partBox('gun-steel', [0.004, 0.024, 0.03], [0.011, 0.08, 0.078]));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0052, 0.0022, 8, 18),
      surface('steel-dark'),
    );
    ring.position.set(0, SIGHT_Y, 0.078);
    root.add(ring);
    root.add(
      uprightCyl('steel-dark', 0.008, 0.008, 0.008, [0.018, 0.078, 0.078], [0, 0, Math.PI / 2], 14),
    );
    root.add(uprightCyl('steel-dark', 0.011, 0.011, 0.006, [0, 0.066, 0.092], undefined, 14));
  } else {
    const mounted = buildMountedOptic(root, opticId, 0.047, -0.004);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // 30-round aluminium STANAG magazine.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.056, -0.06);
  magazine.add(buildCurvedMagazine('gun-steel', 0.022, 0.06, 0.043, 4, 0.05, 0.04));
  root.add(magazine);

  const gripAnchor = anchor(root, [0, -0.086, 0.066], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.012, -0.029, -0.002]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.006, -0.25]);
  const magazineHand = anchor(magazine, [0, -0.1, -0.014], [0.08, 0, 0]);
  const muzzle = anchor(root, [0, 0.018, -0.632]);
  const ejection = anchor(root, [0.024, 0.024, -0.012]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.029, 0.048], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.05, 0.05], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.16,
    slide,
    slideTravel: 0.05,
    action: 'slide',
    recoilProfile: 'carbine',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.16, -0.16, -0.27),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.62, slideRelease: 0.84 },
  };
}
