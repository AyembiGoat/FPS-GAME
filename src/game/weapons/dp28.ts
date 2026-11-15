import * as THREE from 'three';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import {
  addSportingTriggerGuard,
  anchor,
  barrelCyl,
  fromSideProfile,
  partBox,
  sightDotMaterial,
  sportingGripAnchors,
  underHandguardAnchor,
  uprightCyl,
} from './parts';

/**
 * Degtyaryov DP-28 light machine gun, 7.62×54mmR. The flat 47-round pan magazine lies on
 * top of the receiver; below it are the perforated barrel jacket, the gas tube, a cone
 * flash hider, a folded bipod and a plain wooden butt. Iron sights only: the pan sits
 * where an optic would go.
 * Built from reference/arsenal/br/degtyaryov-dp-28-light-machine-gun-side--1 to -4 and
 * dp-28-machine-gun-rear-view-top-pan-maga-1 and -2 for the top of the pan.
 */

const BORE_Y = 0.02;
const SIGHT_Y = 0.088;
const PAN_RADIUS = 0.132;

function buttShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.1, 0.012);
  s.lineTo(0.148, 0.008);
  s.lineTo(0.19, 0.01);
  s.lineTo(0.412, -0.012);
  s.lineTo(0.418, -0.128);
  s.lineTo(0.37, -0.132); // toe
  s.lineTo(0.162, -0.072);
  s.lineTo(0.118, -0.088); // pommel
  s.lineTo(0.084, -0.074);
  s.lineTo(0.074, -0.028);
  s.lineTo(0.1, -0.028);
  s.closePath();
  return s;
}

export function buildDP28(): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(fromSideProfile(buttShape(), 0.04, 0.008, 'ak-wood'), surface('ak-wood')),
  );
  root.add(partBox('steel-dark', [0.04, 0.118, 0.006], [0, -0.07, 0.42], [0.02, 0, 0]));
  addSportingTriggerGuard(root);

  // Long milled receiver, grip-safety lever behind the guard, cocking handle on the right.
  root.add(partBox('steel-dark', [0.044, 0.06, 0.3], [0, 0.004, -0.05]));
  root.add(partBox('steel-dark', [0.01, 0.03, 0.014], [0, -0.05, 0.078], [-0.4, 0, 0]));
  const slide = new THREE.Group();
  slide.add(partBox('gun-steel', [0.02, 0.01, 0.014], [0.03, -0.012, -0.06]));
  slide.add(partBox('gun-steel', [0.004, 0.012, 0.09], [0.0225, -0.012, -0.03]));
  root.add(slide);

  // Rear sight: tangent leaf between two tall guard ears, behind the pan.
  root.add(partBox('steel-dark', [0.03, 0.02, 0.03], [0, 0.044, 0.086]));
  root.add(partBox('steel-dark', [0.004, 0.044, 0.026], [-0.013, 0.07, 0.086]));
  root.add(partBox('steel-dark', [0.004, 0.044, 0.026], [0.013, 0.07, 0.086]));
  root.add(partBox('steel-dark', [0.008, 0.012, 0.006], [-0.0056, SIGHT_Y - 0.004, 0.086]));
  root.add(partBox('steel-dark', [0.008, 0.012, 0.006], [0.0056, SIGHT_Y - 0.004, 0.086]));
  root.add(partBox('steel-dark', [0.018, 0.03, 0.004], [0, 0.066, 0.088]));

  // Perforated barrel jacket, gas tube underneath, barrel, cone flash hider.
  root.add(barrelCyl('steel-dark', 0.021, 0.0225, 0.38, [0, BORE_Y, -0.39], 18));
  for (let i = 0; i < 7; i++) {
    const z = -0.24 - i * 0.05;
    root.add(partBox('polymer-black', [0.046, 0.012, 0.026], [0, BORE_Y + 0.002, z]));
    root.add(partBox('polymer-black', [0.014, 0.046, 0.026], [0, BORE_Y, z + 0.025]));
  }
  root.add(barrelCyl('steel-dark', 0.0082, 0.0082, 0.34, [0, BORE_Y - 0.03, -0.37], 12));
  root.add(partBox('steel-dark', [0.02, 0.04, 0.026], [0, BORE_Y - 0.016, -0.546]));
  root.add(barrelCyl('steel-dark', 0.0105, 0.0105, 0.11, [0, BORE_Y, -0.63], 14));
  root.add(barrelCyl('steel-dark', 0.022, 0.0115, 0.06, [0, BORE_Y, -0.712], 16));
  root.add(barrelCyl('polymer-black', 0.019, 0.019, 0.003, [0, BORE_Y, -0.742], 16));

  // Front sight post between guard ears on the jacket collar.
  root.add(partBox('steel-dark', [0.03, 0.03, 0.022], [0, BORE_Y + 0.03, -0.566]));
  root.add(partBox('steel-dark', [0.004, 0.03, 0.02], [-0.011, SIGHT_Y - 0.01, -0.566]));
  root.add(partBox('steel-dark', [0.004, 0.03, 0.02], [0.011, SIGHT_Y - 0.01, -0.566]));
  root.add(partBox('steel-dark', [0.0024, 0.03, 0.003], [0, SIGHT_Y - 0.015, -0.566]));
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.0026, 0.0028, 0.0034),
    sightDotMaterial(0xf2f2ea),
  );
  tip.position.set(0, SIGHT_Y - 0.0008, -0.566);
  root.add(tip);

  // Bipod folded forward along the jacket, legs strapped together.
  root.add(partBox('steel-dark', [0.05, 0.016, 0.02], [0, BORE_Y - 0.03, -0.585]));
  for (const sx of [-0.016, 0.016]) {
    root.add(barrelCyl('steel-dark', 0.0058, 0.0058, 0.2, [sx, BORE_Y - 0.046, -0.49], 8));
    root.add(partBox('steel-dark', [0.014, 0.006, 0.03], [sx, BORE_Y - 0.05, -0.395]));
  }

  // The pan: a shallow drum with a raised centre boss, radial ribs and a rear latch.
  const magazine = new THREE.Group();
  magazine.position.set(0, 0.05, -0.07);
  magazine.add(uprightCyl('steel-dark', PAN_RADIUS, PAN_RADIUS, 0.026, [0, 0, 0], undefined, 40));
  magazine.add(
    uprightCyl(
      'gun-steel',
      PAN_RADIUS + 0.002,
      PAN_RADIUS + 0.002,
      0.006,
      [0, -0.01, 0],
      undefined,
      40,
    ),
  );
  magazine.add(uprightCyl('gun-steel', 0.04, 0.046, 0.01, [0, 0.016, 0], undefined, 24));
  magazine.add(uprightCyl('steel-dark', 0.014, 0.014, 0.008, [0, 0.024, 0], undefined, 16));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rib = partBox(
      'gun-steel',
      [0.004, 0.003, PAN_RADIUS - 0.05],
      [Math.sin(a) * (PAN_RADIUS + 0.04) * 0.5, 0.0142, Math.cos(a) * (PAN_RADIUS + 0.04) * 0.5],
      [0, a, 0],
    );
    magazine.add(rib);
  }
  magazine.add(partBox('steel-dark', [0.02, 0.012, 0.024], [0, 0.004, PAN_RADIUS + 0.004]));
  root.add(magazine);

  const hands = sportingGripAnchors(root, 'pistol');
  const supportAnchor = underHandguardAnchor(root, [0, BORE_Y - 0.03, -0.27]);
  // The left hand takes the pan by its left rim and lifts it off.
  const magazineHand = anchor(magazine, [-PAN_RADIUS + 0.012, 0, 0.03], [0, 0, -0.5]);
  const muzzle = anchor(root, [0, BORE_Y, -0.746]);
  const ejection = anchor(root, [0.01, -0.03, -0.06], [0, 0, -1.2]);
  const sight = anchor(root, [0, SIGHT_Y, 0.086]);

  return {
    root,
    grip: { anchor: hands.grip, size: [0.034, 0.046], thumb: 'wrapped' },
    trigger: hands.trigger,
    support: { anchor: supportAnchor, size: [0.046, 0.05], thumb: 'alongside' },
    magazineHand,
    magazine,
    magazineTravel: -0.11,
    slide,
    slideTravel: 0.07,
    action: 'slide',
    recoilProfile: 'heavy-rifle',
    muzzle,
    ejection,
    sight,
    aimDistance: 0.17,
    hip: {
      position: new THREE.Vector3(0.17, -0.185, -0.25),
      rotation: new THREE.Euler(0.016, -0.042, -0.022),
    },
    reload: { magazineOut: 0.2, magazineIn: 0.68, slideRelease: 0.88 },
  };
}
