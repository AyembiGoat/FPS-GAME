import * as THREE from 'three';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  anchor,
  barrelCyl,
  buildCurvedMagazine,
  buildEotechHolo,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * HK416 14.5" 5.56×45mm carbine with quad-rail handguard, HK E1 stock, and EOTech EXPS3-0
 * holographic sight. Built from reference/arsenal/01-hk416-side.jpg through 03 and 22–23.
 * Overall length ~0.82 m; y = 0 is the split line between upper and lower receivers.
 */

function lowerReceiverShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.088, 0.002);
  s.lineTo(0.098, 0.002); // receiver top deck
  s.lineTo(0.104, -0.022); // rear extension boss
  s.lineTo(0.08, -0.044); // grip tang
  s.lineTo(0.032, -0.046);
  s.lineTo(-0.022, -0.046); // trigger guard underside
  s.lineTo(-0.03, -0.068); // magwell rear
  s.lineTo(-0.086, -0.064); // flared magwell front
  s.lineTo(-0.092, -0.028);
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.022, -0.018);
  guard.lineTo(0.024, -0.018);
  guard.lineTo(0.024, -0.041);
  guard.lineTo(-0.018, -0.041);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  // HK E1 collapsible concave buttstock profile in (z, y).
  s.moveTo(0.155, 0.022);
  s.lineTo(0.322, 0.026); // top comb
  s.lineTo(0.328, -0.086); // angled concave buttpad
  s.lineTo(0.285, -0.094); // toe
  s.lineTo(0.188, -0.038); // lower cheek strut
  s.lineTo(0.155, -0.014);
  s.closePath();
  return s;
}

function pistolGripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.032, -0.038);
  s.lineTo(0.074, -0.034);
  s.lineTo(0.102, -0.126); // backstrap
  s.lineTo(0.056, -0.132); // base
  s.lineTo(0.028, -0.054); // frontstrap
  s.closePath();
  return s;
}

const GRIP_RAKE = -0.3;

export function buildHK416(): WeaponModel {
  const root = new THREE.Group();

  // Lower receiver & ergonomic HK polymer pistol grip.
  root.add(
    new THREE.Mesh(
      fromSideProfile(lowerReceiverShape(), 0.034, 0.002, 'gun-steel'),
      surface('gun-steel'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(pistolGripShape(), 0.03, 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  // Curved trigger & safety selector.
  root.add(partBox('steel-dark', [0.006, 0.02, 0.005], [0, -0.029, -0.002], [0.22, 0, 0]));
  root.add(partBox('steel-dark', [0.04, 0.007, 0.014], [0, -0.012, 0.036]));

  // Raised HK416 upper receiver (taller than standard M4 for piston clearance).
  root.add(partBox('gun-steel', [0.036, 0.042, 0.2], [0, 0.021, 0.008]));
  // Brass deflector & forward assist on right side.
  root.add(partBox('gun-steel', [0.014, 0.018, 0.016], [0.022, 0.022, 0.042], [0, 0.35, 0]));
  root.add(
    uprightCyl(
      'steel-dark',
      0.0065,
      0.0065,
      0.024,
      [0.024, 0.012, 0.074],
      [0.4, 0, -Math.PI / 2],
      12,
    ),
  );
  // Charging handle T-latch at rear of upper receiver.
  root.add(partBox('steel-dark', [0.042, 0.009, 0.018], [0, 0.034, 0.114]));

  // Ejection port recess + reciprocating bolt carrier (`slide`).
  root.add(partBox('steel-dark', [0.005, 0.016, 0.064], [0.017, 0.022, -0.012]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.014, 0.015, 0.062], [0.011, 0.022, -0.012]));
  root.add(slide);

  // Free-floating HK416 Quad-Rail handguard (z = -0.345..-0.092).
  root.add(partBox('gun-steel', [0.042, 0.046, 0.252], [0, 0.016, -0.218]));
  // Side & bottom Picatinny rail ribs along the handguard.
  for (let i = 0; i < 14; i++) {
    const z = -0.332 + i * 0.017;
    root.add(partBox('steel-dark', [0.052, 0.012, 0.009], [0, 0.016, z]));
    root.add(partBox('steel-dark', [0.019, 0.007, 0.009], [0, -0.01, z]));
    // Cooling port slots on upper bevels.
    root.add(partBox('polymer-black', [0.044, 0.006, 0.008], [0, 0.031, z]));
  }
  // Full-length continuous Mil-Std-1913 top rail across receiver & handguard.
  buildPicatinnyRail(root, 0.042, -0.342, 0.102, 'steel-dark');

  // Gas block, 14.5" steel barrel, and A2 birdcage flash hider.
  root.add(partBox('steel-dark', [0.024, 0.036, 0.036], [0, 0.02, -0.354]));
  root.add(barrelCyl('steel-dark', 0.0092, 0.0102, 0.155, [0, 0.018, -0.405]));
  root.add(barrelCyl('steel-dark', 0.0112, 0.0112, 0.046, [0, 0.018, -0.488], 14));
  // Bore dark cap at muzzle tip.
  root.add(barrelCyl('polymer-black', 0.0055, 0.0055, 0.004, [0, 0.018, -0.511], 12));

  // Buffer tube + HK E1 collapsible stock with rubber buttpad.
  root.add(barrelCyl('gun-steel', 0.0155, 0.0155, 0.145, [0, 0.01, 0.172]));
  root.add(
    new THREE.Mesh(
      fromSideProfile(stockShape(), 0.036, 0.004, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  root.add(partBox('glove', [0.038, 0.114, 0.014], [0, -0.032, 0.328], [0.06, 0, 0]));

  // Low-profile folded flip-up front & rear backup iron sights (kept clear of optical window).
  root.add(partBox('steel-dark', [0.021, 0.008, 0.032], [0, 0.049, -0.322]));
  root.add(partBox('steel-dark', [0.022, 0.007, 0.026], [0, 0.049, 0.084]));

  // EOTech EXPS3-0 Holographic Weapon Sight mounted squarely over the receiver.
  const sightY = buildEotechHolo(root, 0.048, -0.01);

  // Removable 30-round curved polymer PMAG.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.056, -0.056);
  magazine.add(buildCurvedMagazine('polymer-black', 0.024, 0.06, 0.044, 4, 0.065, 0.05));
  root.add(magazine);

  // Anchors.
  const gripAnchor = anchor(root, [0, -0.086, 0.064], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.012, -0.029, -0.002]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.012, -0.23]);
  const magazineHand = anchor(magazine, [0, -0.1, -0.016], [0.08, 0, 0]);
  const muzzle = anchor(root, [0, 0.018, -0.514]);
  const ejection = anchor(root, [0.024, 0.024, -0.012]);
  const sight = anchor(root, [0, sightY, 0.01]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.03, 0.048], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.046], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.16,
    slide,
    slideTravel: 0.048,
    action: 'slide',
    muzzle,
    ejection,
    sight,
    aimDistance: 0.215,
    hip: {
      position: new THREE.Vector3(0.16, -0.162, -0.3),
      rotation: new THREE.Euler(0.018, -0.042, -0.024),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.65, slideRelease: 0.84 },
  };
}
