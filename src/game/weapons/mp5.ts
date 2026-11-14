import * as THREE from 'three';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildCurvedMagazine,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * Heckler & Koch MP5A3 9×19mm submachine gun with tubular receiver, tropical polymer
 * handguard, left-front cocking handle, curved 30-round mag, A3 collapsing wire stock,
 * and iconic hooded rotary diopter drum iron sights. Built from reference/arsenal/10–12.
 */

function lowerHousingShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.044, 0.0);
  s.lineTo(0.088, 0.0);
  s.lineTo(0.084, -0.036);
  s.lineTo(0.112, -0.118); // contoured Navy pistol grip backstrap
  s.lineTo(0.068, -0.124); // grip base
  s.lineTo(0.034, -0.044); // front strap
  s.lineTo(-0.032, -0.044); // trigger guard bottom
  s.lineTo(-0.044, -0.022);
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.028, -0.014);
  guard.lineTo(0.024, -0.014);
  guard.lineTo(0.024, -0.038);
  guard.lineTo(-0.024, -0.038);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function handguardShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Iconic MP5 wide sloped tropical polymer forend in (z, y).
  s.moveTo(-0.268, 0.026);
  s.lineTo(-0.105, 0.026);
  s.lineTo(-0.105, -0.022);
  s.lineTo(-0.252, -0.008); // smooth upward taper toward muzzle
  s.lineTo(-0.268, 0.006);
  s.closePath();
  return s;
}

const GRIP_RAKE = -0.32;

export function buildMP5(): WeaponModel {
  const root = new THREE.Group();

  // Stamped steel upper receiver (lower rectangular channel + iconic upper cocking tube).
  root.add(partBox('steel-dark', [0.033, 0.036, 0.2], [0, 0.014, -0.01]));
  root.add(barrelCyl('steel-dark', 0.0155, 0.0155, 0.365, [0, 0.03, -0.095], 18));
  // Flared steel magwell ahead of the trigger housing.
  root.add(partBox('steel-dark', [0.03, 0.048, 0.056], [0, -0.014, -0.078]));

  // Iconic front-left HK "slap" cocking handle protruding from the cocking tube.
  root.add(
    uprightCyl('polymer-black', 0.0055, 0.0055, 0.036, [-0.026, 0.038, -0.222], [0, 0, 1.15], 12),
  );

  // Ejection port + reciprocating roller-delayed bolt (`slide`).
  root.add(partBox('polymer-black', [0.005, 0.015, 0.056], [0.016, 0.018, -0.018]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.012, 0.014, 0.054], [0.012, 0.018, -0.018]));
  root.add(slide);

  // Contoured black polymer lower housing & Navy grip + selector switch + trigger.
  root.add(
    new THREE.Mesh(
      fromSideProfile(lowerHousingShape(), 0.03, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('steel-dark', [0.005, 0.019, 0.005], [0, -0.025, -0.002], [0.22, 0, 0]));
  root.add(partBox('polymer-black', [0.038, 0.008, 0.016], [0, -0.008, 0.034]));

  // Iconic wide tropical polymer handguard.
  root.add(
    new THREE.Mesh(
      fromSideProfile(handguardShape(), 0.042, 0.005, 'polymer-black'),
      surface('polymer-black'),
    ),
  );

  // Tri-lug 9mm barrel extending past handguard.
  root.add(barrelCyl('steel-dark', 0.0086, 0.0094, 0.085, [0, 0.012, -0.305], 16));
  root.add(barrelCyl('steel-dark', 0.011, 0.011, 0.012, [0, 0.012, -0.335], 12));
  root.add(barrelCyl('polymer-black', 0.0048, 0.0048, 0.004, [0, 0.012, -0.348], 12));

  // A3 retractable twin-rail steel buttstock (compact, iconic silhouette).
  root.add(partBox('steel-dark', [0.036, 0.046, 0.034], [0, 0.016, 0.098]));
  // Left & right sliding steel stock rails.
  root.add(partBox('gun-steel', [0.005, 0.011, 0.195], [-0.019, 0.012, 0.19]));
  root.add(partBox('gun-steel', [0.005, 0.011, 0.195], [0.019, 0.012, 0.19]));
  // Curved rubber buttpad at rear of telescoping stock.
  root.add(partBox('glove', [0.036, 0.102, 0.02], [0, -0.018, 0.292], [0.08, 0, 0]));

  // Rear HK rotary diopter drum sight (centered cleanly at y = 0.0565).
  const sightY = 0.0565;
  root.add(partBox('steel-dark', [0.022, 0.012, 0.026], [0, 0.045, 0.058]));
  // Open rear diopter arch (left/right drum cheeks so center sight line is crystal clear!).
  root.add(partBox('steel-dark', [0.0055, 0.018, 0.014], [-0.0075, sightY, 0.058]));
  root.add(partBox('steel-dark', [0.0055, 0.018, 0.014], [0.0075, sightY, 0.058]));
  root.add(partBox('steel-dark', [0.02, 0.003, 0.014], [0, sightY - 0.008, 0.058]));

  // Iconic MP5 circular hooded front sight ring at muzzle (aligned to sightY = 0.0565!).
  root.add(partBox('steel-dark', [0.018, 0.024, 0.022], [0, 0.036, -0.285]));
  const hood = new THREE.Mesh(
    new THREE.TorusGeometry(0.0115, 0.0022, 10, 22),
    surface('steel-dark'),
  );
  hood.position.set(0, sightY, -0.285);
  root.add(hood);
  const frontPost = partBox('steel-dark', [0.0022, 0.011, 0.003], [0, sightY - 0.0055, -0.285]);
  const frontDot = new THREE.Mesh(
    new THREE.BoxGeometry(0.0025, 0.0026, 0.0034),
    sightDotMaterial(0x7dff9c),
  );
  frontDot.position.set(0, sightY, -0.285);
  root.add(frontPost, frontDot);

  // Slim curved 30-round steel 9×19mm magazine.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.034, -0.078);
  magazine.add(buildCurvedMagazine('steel-dark', 0.021, 0.035, 0.048, 4, 0.078, 0.04));
  root.add(magazine);

  // Anchors.
  const gripAnchor = anchor(root, [0, -0.08, 0.068], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.011, -0.025, -0.002]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.004, -0.19]);
  const magazineHand = anchor(magazine, [0, -0.105, -0.016], [0.1, 0, 0]);
  const muzzle = anchor(root, [0, 0.012, -0.352]);
  const ejection = anchor(root, [0.022, 0.02, -0.018]);
  const sight = anchor(root, [0, sightY, 0.064]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.028, 0.044], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.042, 0.044], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.165,
    slide,
    slideTravel: 0.042,
    action: 'slide',
    muzzle,
    ejection,
    sight,
    aimDistance: 0.165,
    hip: {
      position: new THREE.Vector3(0.15, -0.152, -0.28),
      rotation: new THREE.Euler(0.018, -0.042, -0.025),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.62, slideRelease: 0.84 },
  };
}
