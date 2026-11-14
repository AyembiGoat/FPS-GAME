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
} from './parts';

/**
 * AK-47 / AKM 7.62×39mm assault rifle with oiled laminate wood furniture, iconic banana
 * magazine, angled gas block, and tangent leaf U-notch iron sights.
 * Built from reference/arsenal/04-ak47-side.jpg through 06-ak47-receiver.jpg.
 */

function stockShape(): THREE.Shape {
  const s = new THREE.Shape();
  // Classic downward-sloping AK wooden stock in (z, y).
  s.moveTo(0.105, 0.018);
  s.lineTo(0.335, -0.018); // angled top comb
  s.lineTo(0.34, -0.118); // vertical steel buttplate
  s.lineTo(0.285, -0.118);
  s.lineTo(0.105, -0.024); // receiver lower tang
  s.closePath();
  return s;
}

function gripShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.04, -0.03);
  s.lineTo(0.076, -0.026);
  s.lineTo(0.108, -0.12);
  s.lineTo(0.068, -0.126);
  s.lineTo(0.036, -0.044);
  s.closePath();
  return s;
}

const GRIP_RAKE = -0.32;

export function buildAK47(): WeaponModel {
  const root = new THREE.Group();

  // Slab-sided stamped steel receiver (y: -0.034..0.018, z: -0.105..0.11).
  root.add(partBox('steel-dark', [0.034, 0.052, 0.215], [0, -0.008, 0.002]));
  // Rounded ribbed stamped dust cover sitting on top of receiver.
  root.add(barrelCyl('steel-dark', 0.0172, 0.0172, 0.206, [0, 0.018, 0.008], 16));
  // Receiver recoil-spring release button at rear.
  root.add(partBox('gun-steel', [0.01, 0.011, 0.012], [0, 0.022, 0.114]));

  // Iconic large stamped right-side selector/safety lever.
  root.add(partBox('gun-steel', [0.004, 0.014, 0.115], [0.019, 0.004, 0.018], [0.08, 0, 0]));
  root.add(partBox('gun-steel', [0.009, 0.011, 0.014], [0.022, 0.001, -0.035]));

  // Reciprocating steel bolt carrier + right-side hooked charging handle (`slide`).
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.008, 0.014, 0.078], [0.015, 0.016, -0.042]));
  slide.add(partBox('gun-steel', [0.022, 0.008, 0.012], [0.026, 0.018, -0.062], [0, 0, 0.15]));
  root.add(slide);

  // Trigger guard & trigger.
  root.add(partBox('steel-dark', [0.012, 0.003, 0.052], [0, -0.054, 0.012]));
  root.add(partBox('steel-dark', [0.012, 0.022, 0.004], [0, -0.044, -0.012]));
  root.add(partBox('steel-dark', [0.012, 0.022, 0.004], [0, -0.044, 0.038]));
  root.add(partBox('gun-steel', [0.005, 0.02, 0.005], [0, -0.042, 0.014], [0.24, 0, 0]));
  // Mag release paddle behind magazine well.
  root.add(partBox('steel-dark', [0.01, 0.024, 0.007], [0, -0.044, -0.019], [0.2, 0, 0]));

  // Wood laminate pistol grip & sloping fixed wooden buttstock.
  root.add(
    new THREE.Mesh(fromSideProfile(gripShape(), 0.027, 0.003, 'ak-wood'), surface('ak-wood')),
  );
  root.add(
    new THREE.Mesh(fromSideProfile(stockShape(), 0.034, 0.004, 'ak-wood'), surface('ak-wood')),
  );
  root.add(partBox('steel-dark', [0.035, 0.104, 0.008], [0, -0.068, 0.34]));

  // Rear tangent leaf sight block (y = 0.036..0.051 at z = -0.115) with clean U-notch!
  root.add(partBox('steel-dark', [0.028, 0.026, 0.044], [0, 0.026, -0.115]));
  // Left and right rear sight leaf walls creating a crisp 4.2 mm central notch around y = 0.048.
  root.add(partBox('steel-dark', [0.008, 0.013, 0.016], [-0.0062, 0.044, -0.104]));
  root.add(partBox('steel-dark', [0.008, 0.013, 0.016], [0.0062, 0.044, -0.104]));
  root.add(partBox('steel-dark', [0.02, 0.004, 0.016], [0, 0.039, -0.104]));

  // Two-piece oiled wood handguard (lower swell + upper rounded gas-tube cover).
  root.add(partBox('ak-wood', [0.038, 0.032, 0.165], [0, -0.002, -0.205]));
  root.add(barrelCyl('ak-wood', 0.016, 0.016, 0.145, [0, 0.024, -0.202], 14));
  // Front & rear stamped handguard retainer ferrules.
  root.add(partBox('steel-dark', [0.039, 0.036, 0.012], [0, 0.0, -0.29]));
  root.add(partBox('steel-dark', [0.039, 0.036, 0.01], [0, 0.0, -0.12]));

  // Exposed upper gas tube + iconic 45° slanted AK gas block.
  root.add(barrelCyl('steel-dark', 0.0095, 0.0095, 0.075, [0, 0.025, -0.312], 14));
  root.add(partBox('steel-dark', [0.019, 0.034, 0.026], [0, 0.015, -0.354], [-0.35, 0, 0]));

  // Exposed steel barrel, under-barrel cleaning rod, and slant compensator muzzle.
  root.add(barrelCyl('steel-dark', 0.0088, 0.0098, 0.25, [0, 0.004, -0.398], 16));
  root.add(barrelCyl('gun-steel', 0.0026, 0.0026, 0.22, [0, -0.012, -0.388], 8));
  root.add(barrelCyl('steel-dark', 0.0102, 0.0102, 0.036, [0, 0.004, -0.532], 14));
  root.add(barrelCyl('polymer-black', 0.0055, 0.0055, 0.004, [0, 0.004, -0.551], 12));

  // Hooded AK front sight tower (aligned precisely to rear notch y = 0.0485!).
  root.add(partBox('steel-dark', [0.016, 0.036, 0.024], [0, 0.02, -0.495]));
  // Left & right protective sight ears + bright front aiming post tip.
  root.add(partBox('steel-dark', [0.003, 0.022, 0.014], [-0.0095, 0.048, -0.495]));
  root.add(partBox('steel-dark', [0.003, 0.022, 0.014], [0.0095, 0.048, -0.495]));
  root.add(partBox('steel-dark', [0.022, 0.003, 0.014], [0, 0.059, -0.495]));
  const frontPost = partBox('steel-dark', [0.0024, 0.014, 0.003], [0, 0.042, -0.495]);
  const tipDot = new THREE.Mesh(
    new THREE.BoxGeometry(0.0026, 0.003, 0.0032),
    sightDotMaterial(0xffd27a),
  );
  tipDot.position.set(0, 0.048, -0.495);
  root.add(frontPost, tipDot);

  // Iconic steeply curved 30-round steel 7.62×39mm banana magazine.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.032, -0.058);
  magazine.add(buildCurvedMagazine('steel-dark', 0.025, 0.062, 0.048, 4, 0.135, 0.06));
  root.add(magazine);

  // Anchors.
  const gripAnchor = anchor(root, [0, -0.08, 0.072], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.011, -0.042, 0.014]);
  const supportAnchor = underHandguardAnchor(root, [0, 0.004, -0.215]);
  const magazineHand = anchor(magazine, [0, -0.11, -0.032], [0.22, 0, 0]);
  const muzzle = anchor(root, [0, 0.004, -0.554]);
  const ejection = anchor(root, [0.022, 0.018, -0.042]);
  // Eye lines up right behind the tangent leaf notch looking down the barrel at the front post.
  const sight = anchor(root, [0, 0.048, -0.095]);

  return {
    root,
    grip: { anchor: gripAnchor, size: [0.028, 0.044], thumb: 'wrapped' },
    trigger,
    support: { anchor: supportAnchor, size: [0.042, 0.044], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: 0.17,
    slide,
    slideTravel: 0.058,
    action: 'slide',
    muzzle,
    ejection,
    sight,
    aimDistance: 0.24,
    hip: {
      position: new THREE.Vector3(0.16, -0.158, -0.3),
      rotation: new THREE.Euler(0.018, -0.04, -0.022),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.64, slideRelease: 0.85 },
  };
}
