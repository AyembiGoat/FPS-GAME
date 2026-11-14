import * as THREE from 'three';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildCompactReflex,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * FN SCAR-H (Mk 17 Mod 0) 7.62×51mm battle rifle in Flat Dark Earth (FDE), with monolithic
 * tall upper receiver, straight 20-round box magazine, PWS muzzle brake, UGG-boot folding
 * stock, and compact 1.8× combat reflex sight. Built from reference/arsenal/07–09.
 */

function lowerShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.098, 0.002);
  s.lineTo(0.094, 0.002);
  s.lineTo(0.096, -0.028);
  s.lineTo(0.074, -0.044);
  s.lineTo(0.032, -0.046);
  s.lineTo(-0.02, -0.046);
  s.lineTo(-0.028, -0.068);
  s.lineTo(-0.096, -0.066); // wide 7.62×51 magwell
  s.lineTo(-0.1, -0.024);
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.018, -0.018);
  guard.lineTo(0.026, -0.018);
  guard.lineTo(0.026, -0.041);
  guard.lineTo(-0.014, -0.041);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function uggStockShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Iconic SCAR folding telescoping "UGG-boot" stock with adjustable cheek riser.
  s.moveTo(0.112, 0.046);
  s.lineTo(0.185, 0.046);
  s.lineTo(0.195, 0.056); // raised cheekpiece front
  s.lineTo(0.285, 0.056); // cheekpiece top
  s.lineTo(0.295, 0.046);
  s.lineTo(0.34, 0.044);
  s.lineTo(0.348, -0.072); // rubber buttpad vertical face
  s.lineTo(0.292, -0.08); // boot toe
  s.lineTo(0.268, -0.03); // boot ankle step
  s.lineTo(0.112, -0.016); // hinge block lower
  s.closePath();
  return s;
}

function gripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.034, -0.038);
  s.lineTo(0.074, -0.034);
  s.lineTo(0.102, -0.126);
  s.lineTo(0.058, -0.132);
  s.lineTo(0.03, -0.052);
  s.closePath();
  return s;
}

const GRIP_RAKE = -0.3;

export function buildScarH(): WeaponModel {
  const root = new THREE.Group();

  // Tall monolithic extruded FDE upper receiver (signature SCAR boxy silhouette).
  root.add(partBox('anodized-fde', [0.04, 0.058, 0.42], [0, 0.03, -0.095]));
  // Tapered upper chamfer ridge.
  root.add(partBox('anodized-fde', [0.03, 0.01, 0.41], [0, 0.062, -0.095]));
  // Side cooling oval slots + side short Picatinny rails near muzzle end.
  for (let i = 0; i < 4; i++) {
    const z = -0.275 + i * 0.036;
    root.add(partBox('steel-dark', [0.042, 0.011, 0.022], [0, 0.034, z]));
    root.add(partBox('steel-dark', [0.048, 0.01, 0.012], [0, 0.012, z]));
  }
  // Bottom forward handguard rail.
  root.add(partBox('steel-dark', [0.02, 0.008, 0.175], [0, -0.003, -0.21]));
  // Full-length continuous Picatinny top rail.
  buildPicatinnyRail(root, 0.066, -0.302, 0.108, 'steel-dark');

  // Ejection port + reciprocating bolt carrier & side charging handle (`slide`).
  root.add(partBox('steel-dark', [0.005, 0.018, 0.078], [0.019, 0.032, -0.028]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.014, 0.016, 0.074], [0.012, 0.032, -0.028]));
  // Angled left-side tactical charging knob visible in first person!
  slide.add(
    uprightCyl('steel-dark', 0.0055, 0.0065, 0.032, [-0.03, 0.036, -0.09], [0, 0, Math.PI / 2], 12),
  );
  root.add(slide);

  // FDE polymer lower receiver + contrasting black A2 pistol grip + ambidextrous safety.
  root.add(
    new THREE.Mesh(
      fromSideProfile(lowerShape(), 0.036, 0.002, 'anodized-fde'),
      surface('anodized-fde'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripShape(), 0.03, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('steel-dark', [0.006, 0.02, 0.005], [0, -0.029, 0.004], [0.2, 0, 0]));
  root.add(partBox('polymer-black', [0.042, 0.008, 0.016], [0, -0.012, 0.038]));

  // Heavy 16" barrel, hooded gas-block front sight base, and distinctive PWS 3-chamber brake.
  root.add(partBox('steel-dark', [0.026, 0.042, 0.042], [0, 0.034, -0.326]));
  root.add(barrelCyl('steel-dark', 0.0102, 0.0112, 0.16, [0, 0.028, -0.39], 16));
  // PWS side-baffle muzzle brake (rectangular ports).
  root.add(partBox('steel-dark', [0.024, 0.022, 0.056], [0, 0.028, -0.49]));
  for (const bz of [-0.474, -0.492, -0.508]) {
    root.add(partBox('polymer-black', [0.025, 0.011, 0.008], [0, 0.028, bz]));
  }
  root.add(barrelCyl('polymer-black', 0.0062, 0.0062, 0.004, [0, 0.028, -0.519], 12));

  // Signature SCAR folding FDE "UGG-boot" stock + cheek hinge + black buttpad.
  root.add(partBox('steel-dark', [0.042, 0.06, 0.022], [0, 0.02, 0.112]));
  root.add(
    new THREE.Mesh(
      fromSideProfile(uggStockShape(), 0.036, 0.004, 'anodized-fde'),
      surface('anodized-fde'),
    ),
  );
  root.add(partBox('glove', [0.038, 0.122, 0.015], [0, -0.016, 0.35], [0.04, 0, 0]));

  // Straight 20-round steel 7.62×51mm box magazine (clean straight silhouette vs 5.56 curve!).
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.058, -0.062);
  magazine.add(partBox('anodized-fde', [0.027, 0.155, 0.072], [0, -0.076, 0]));
  magazine.add(partBox('steel-dark', [0.03, 0.011, 0.076], [0, -0.154, 0]));
  root.add(magazine);

  // Compact FDE tactical reflex optic (1.8×) on top rail + flush folded rear BUIS.
  root.add(partBox('steel-dark', [0.022, 0.007, 0.026], [0, 0.073, 0.088]));
  const sightY = buildCompactReflex(root, 0.072, -0.012);

  // Anchors.
  const gripAnchor = anchor(root, [0, -0.086, 0.066], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.012, -0.029, 0.004]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.016, -0.22]);
  const magazineHand = anchor(magazine, [0, -0.092, 0], [0.04, 0, 0]);
  const muzzle = anchor(root, [0, 0.028, -0.522]);
  const ejection = anchor(root, [0.024, 0.034, -0.028]);
  const sight = anchor(root, [0, sightY, 0.012]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.03, 0.048], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.052, 0.044], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.155,
    slide,
    slideTravel: 0.056,
    action: 'slide',
    muzzle,
    ejection,
    sight,
    aimDistance: 0.215,
    hip: {
      position: new THREE.Vector3(0.165, -0.172, -0.3),
      rotation: new THREE.Euler(0.018, -0.042, -0.025),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.65, slideRelease: 0.85 },
  };
}
