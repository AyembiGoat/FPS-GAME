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
} from './parts';

/**
 * Steyr AUG A3, 5.56×45mm bullpup. Olive polymer stock with the magazine behind the grip,
 * a full-hand trigger guard, an aluminium receiver carrying a long top rail, the exposed
 * barrel with its gas regulator, and the folding foregrip (modelled folded forward).
 * Built from reference/arsenal/br/steyr-aug-a3-rear-view-shooter-perspecti-3 and
 * steyr-aug-a3-rifle-side-profile-isolated-2.
 */

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.112, 0.022);
  s.lineTo(0.128, 0.022);
  s.lineTo(0.156, 0.05); // stock rises to wrap the rear of the receiver
  s.lineTo(0.374, 0.05);
  s.lineTo(0.38, -0.1); // butt
  s.lineTo(0.304, -0.104); // toe
  s.lineTo(0.262, -0.064); // magazine well, rear
  s.lineTo(0.148, -0.064); // magazine well, front
  s.lineTo(0.122, -0.034);
  s.lineTo(-0.112, -0.03);
  s.closePath();
  return s;
}

function gripGuardShape(): THREE.Shape {
  // Pistol grip and the bow that guards the whole hand.
  const s = new THREE.Shape();
  s.moveTo(-0.1, -0.028);
  s.lineTo(0.12, -0.028);
  s.lineTo(0.106, -0.128);
  s.lineTo(-0.018, -0.128);
  s.lineTo(-0.062, -0.1); // the bow sweeps down and back from the stock nose
  s.lineTo(-0.1, -0.05);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.082, -0.04);
  hole.lineTo(0.03, -0.04);
  hole.lineTo(0.052, -0.114);
  hole.lineTo(-0.014, -0.114);
  hole.lineTo(-0.05, -0.092);
  hole.lineTo(-0.082, -0.052);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

const GRIP_RAKE = -0.27;
const BORE_Y = 0.036;
const RAIL_Y = 0.051;

export function buildAugA3(opticId: OpticId = 'red-dot'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(fromSideProfile(stockShape(), 0.05, 0.006, 'chassis-od'), surface('chassis-od')),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripGuardShape(), 0.03, 0.004, 'chassis-od'),
      surface('chassis-od'),
    ),
  );
  // Wide polymer trigger blade, cross-bolt safety, rubber butt plate, rear sling swivel.
  root.add(partBox('polymer-black', [0.012, 0.026, 0.006], [0, -0.052, 0.006], [0.14, 0, 0]));
  root.add(partBox('polymer-black', [0.056, 0.012, 0.012], [0, -0.016, 0.086]));
  root.add(partBox('glove', [0.05, 0.146, 0.01], [0, -0.026, 0.386]));
  root.add(partBox('steel-dark', [0.056, 0.01, 0.014], [0, -0.02, 0.33]));
  // Take-down button and stock seam.
  root.add(partBox('polymer-black', [0.052, 0.002, 0.2], [0, -0.012, 0.26]));

  // Aluminium receiver with the long top rail and a short side rail on the right.
  root.add(partBox('gun-steel', [0.038, 0.03, 0.3], [0, BORE_Y, -0.01]));
  buildPicatinnyRail(root, RAIL_Y, -0.156, 0.136, 'gun-steel');
  root.add(partBox('gun-steel', [0.006, 0.014, 0.07], [0.022, BORE_Y, -0.11]));
  // Charging handle on the left, forward.
  root.add(partBox('steel-dark', [0.012, 0.012, 0.022], [-0.025, BORE_Y + 0.004, -0.112]));
  root.add(partBox('polymer-black', [0.003, 0.006, 0.12], [-0.0195, BORE_Y + 0.004, -0.07]));

  // Ejection port in the stock behind the grip, with the bolt showing.
  root.add(partBox('polymer-black', [0.004, 0.018, 0.056], [0.0245, 0.03, 0.2]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.006, 0.014, 0.05], [0.0215, 0.03, 0.2]));
  root.add(slide);

  // Barrel, locking collar, gas regulator plug, three-prong style flash hider.
  root.add(barrelCyl('steel-dark', 0.0088, 0.0098, 0.262, [0, BORE_Y, -0.288], 16));
  root.add(barrelCyl('steel-dark', 0.0165, 0.0165, 0.03, [0, BORE_Y, -0.172], 16));
  root.add(partBox('steel-dark', [0.022, 0.03, 0.032], [0.004, BORE_Y - 0.002, -0.218]));
  root.add(barrelCyl('gun-steel', 0.0068, 0.0068, 0.05, [0.012, BORE_Y + 0.006, -0.236], 12));
  root.add(barrelCyl('steel-dark', 0.0112, 0.0112, 0.044, [0, BORE_Y, -0.432], 14));
  root.add(barrelCyl('polymer-black', 0.0052, 0.0052, 0.004, [0, BORE_Y, -0.455], 12));

  // Folding foregrip, hinged on the collar and folded forward under the barrel.
  root.add(partBox('steel-dark', [0.02, 0.016, 0.02], [0, BORE_Y - 0.022, -0.2]));
  root.add(partBox('chassis-od', [0.03, 0.026, 0.098], [0, BORE_Y - 0.03, -0.258]));
  root.add(partBox('chassis-od', [0.032, 0.03, 0.012], [0, BORE_Y - 0.03, -0.308]));

  let sightY = RAIL_Y + 0.036;
  let sightZ = 0.108;
  let aimDistance = 0.16;
  if (opticId === 'irons') {
    // Flip-up rear aperture and front post standing on the rail.
    root.add(partBox('steel-dark', [0.022, 0.01, 0.026], [0, RAIL_Y + 0.011, 0.11]));
    root.add(partBox('steel-dark', [0.004, 0.026, 0.006], [-0.008, RAIL_Y + 0.028, 0.11]));
    root.add(partBox('steel-dark', [0.004, 0.026, 0.006], [0.008, RAIL_Y + 0.028, 0.11]));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.0048, 0.002, 8, 18),
      surface('steel-dark'),
    );
    ring.position.set(0, sightY, 0.11);
    root.add(ring);
    root.add(partBox('steel-dark', [0.022, 0.01, 0.026], [0, RAIL_Y + 0.011, -0.14]));
    root.add(partBox('steel-dark', [0.003, 0.03, 0.01], [-0.008, RAIL_Y + 0.03, -0.14]));
    root.add(partBox('steel-dark', [0.003, 0.03, 0.01], [0.008, RAIL_Y + 0.03, -0.14]));
    root.add(partBox('steel-dark', [0.0022, 0.026, 0.0026], [0, RAIL_Y + 0.023, -0.14]));
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.0026, 0.003),
      sightDotMaterial(0xf2f2ea),
    );
    tip.position.set(0, sightY - 0.0006, -0.14);
    root.add(tip);
  } else {
    const mounted = buildMountedOptic(root, opticId, RAIL_Y + 0.006, -0.02);
    sightY = mounted.sightY;
    sightZ = mounted.sightZ;
    aimDistance = mounted.aimDistance;
  }

  // 30-round translucent-brown waffle magazine behind the grip.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.06, 0.205);
  magazine.add(buildCurvedMagazine('anodized-fde', 0.024, 0.062, 0.04, 4, 0.05, 0.03));
  for (let i = 0; i < 4; i++) {
    magazine.add(
      partBox('steel-dark', [0.0255, 0.004, 0.05], [0, -0.03 - i * 0.034, -0.004 - i * 0.004]),
    );
  }
  root.add(magazine);

  const gripAnchor = anchor(root, [0, -0.084, 0.078], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.013, -0.052, 0.006]);
  const supportAnchor = underHandguardAnchor(root, [0, BORE_Y - 0.03, -0.258]);
  const magazineHand = anchor(magazine, [0, -0.095, -0.012], [0.06, 0, 0]);
  const muzzle = anchor(root, [0, BORE_Y, -0.458]);
  const ejection = anchor(root, [0.03, 0.032, 0.2]);
  const sight = anchor(root, [0, sightY, sightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.03, 0.05], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.036, 0.04], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.16,
    slide,
    slideTravel: 0.044,
    action: 'slide',
    recoilProfile: 'carbine',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.155, -0.15, -0.36),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.24, magazineIn: 0.66, slideRelease: 0.86 },
  };
}
