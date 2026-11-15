import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import { FINGER } from './model';
import {
  anchor,
  barrelCyl,
  buildMountedOptic,
  fromSideProfile,
  partBox,
  sightDotMaterial,
} from './parts';

/**
 * Beretta 92FS, 9×19mm. The open-top slide leaves the barrel bare for most of its length;
 * the safety lever sits on the slide, the trigger guard is rounded with a squared front,
 * and the alloy frame carries a wide double-stack grip. 217 mm long.
 * Built from reference/arsenal/br/beretta-92fs-pistol-side-profile-isolate-1 and -4,
 * rear view from beretta-92fs-rear-view-sights-hammer-fro-3.
 */

const GRIP_RAKE = -0.24;
const GRIP_SIZE = [0.033, 0.054] as const;
const SLIDE_TOP = 0.03;
const BORE_Y = 0.017;
const MUZZLE_Z = -0.118;

function frameProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.092, 0.002);
  s.lineTo(0.084, 0.002);
  s.lineTo(0.102, -0.004); // tang
  s.lineTo(0.098, -0.012);
  s.lineTo(0.086, -0.024);
  s.lineTo(0.09, -0.06); // back strap
  s.lineTo(0.106, -0.112);
  s.lineTo(0.05, -0.12); // butt, flared
  s.lineTo(0.024, -0.04); // front strap
  s.lineTo(0.016, -0.05);
  s.lineTo(-0.026, -0.052); // trigger guard, squared front
  s.lineTo(-0.04, -0.044);
  s.lineTo(-0.042, -0.016);
  s.lineTo(-0.09, -0.014); // dust cover
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.035, -0.02);
  guard.lineTo(0.014, -0.02);
  guard.lineTo(0.014, -0.044);
  guard.lineTo(-0.024, -0.046);
  guard.lineTo(-0.034, -0.04);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function gripPanelProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.03, -0.03);
  s.lineTo(0.084, -0.026);
  s.lineTo(0.1, -0.106);
  s.lineTo(0.052, -0.113);
  s.closePath();
  return s;
}

export function buildBeretta92FS(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  root.add(
    new THREE.Mesh(
      fromSideProfile(frameProfile(), 0.024, 0.0018, 'steel-dark'),
      surface('steel-dark'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripPanelProfile(), GRIP_SIZE[0], 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  // Trigger, take-down lever, slide stop, hammer, lanyard loop.
  root.add(partBox('gun-steel', [0.006, 0.02, 0.006], [0, -0.03, -0.004], [0.2, 0, 0]));
  root.add(partBox('gun-steel', [0.027, 0.006, 0.014], [0, -0.006, -0.04]));
  root.add(partBox('gun-steel', [0.004, 0.005, 0.03], [-0.0135, -0.004, 0.02]));
  root.add(partBox('gun-steel', [0.007, 0.018, 0.008], [0, 0.014, 0.098], [-0.5, 0, 0]));
  root.add(partBox('gun-steel', [0.008, 0.008, 0.008], [0, -0.118, 0.092]));

  // Bare barrel, fixed to the frame; it shows through the open slide and past its nose.
  root.add(barrelCyl('gun-steel', 0.0072, 0.0072, 0.128, [0, BORE_Y, -0.054], 16));
  root.add(barrelCyl('polymer-black', 0.0046, 0.0046, 0.003, [0, BORE_Y, MUZZLE_Z - 0.0006], 12));

  // Slide: two rails, a front bridge with the sight, the closed rear block.
  const slide = new THREE.Group();
  for (const sx of [-0.0112, 0.0112]) {
    slide.add(partBox('steel-dark', [0.0046, 0.022, 0.2], [sx, 0.012, -0.008]));
  }
  slide.add(partBox('steel-dark', [0.027, 0.008, 0.2], [0, 0.004, -0.008]));
  slide.add(partBox('steel-dark', [0.027, 0.012, 0.022], [0, SLIDE_TOP - 0.006, -0.097]));
  slide.add(partBox('steel-dark', [0.027, 0.016, 0.078], [0, SLIDE_TOP - 0.008, 0.053]));
  for (let i = 0; i < 9; i++) {
    slide.add(partBox('gun-steel', [0.0276, 0.016, 0.0016], [0, 0.014, 0.05 + i * 0.0042]));
  }
  // Slide-mounted safety and decocking lever, both sides.
  slide.add(partBox('gun-steel', [0.034, 0.007, 0.016], [0, 0.02, 0.07], [0.3, 0, 0]));
  // Front blade with a white dot; rear notch with two dots.
  const sightY = SLIDE_TOP + 0.0052;
  slide.add(partBox('steel-dark', [0.0034, 0.006, 0.012], [0, SLIDE_TOP + 0.002, -0.098]));
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.003, 0.003, 0.002),
    sightDotMaterial(0xffffff),
  );
  front.position.set(0, sightY - 0.0012, -0.0916);
  slide.add(front);
  const notch = 0.0046;
  slide.add(partBox('steel-dark', [0.0056, 0.006, 0.009], [-notch, SLIDE_TOP + 0.003, 0.084]));
  slide.add(partBox('steel-dark', [0.0056, 0.006, 0.009], [notch, SLIDE_TOP + 0.003, 0.084]));
  slide.add(partBox('steel-dark', [0.016, 0.002, 0.009], [0, SLIDE_TOP + 0.001, 0.084]));
  for (const sx of [-notch, notch]) {
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.0024, 0.0024, 0.0016),
      sightDotMaterial(0xffffff),
    );
    dot.position.set(sx, sightY - 0.0014, 0.0888);
    slide.add(dot);
  }
  let finalSightY = sightY;
  let finalSightZ = 0.088;
  let aimDistance = 0.42;
  if (opticId !== 'irons') {
    const mounted = buildMountedOptic(slide, opticId, SLIDE_TOP - 0.001, 0.046, { compact: true });
    finalSightY = mounted.sightY;
    finalSightZ = mounted.sightZ;
    aimDistance = 0.36;
  }
  root.add(slide);

  // 15-round double-stack magazine inside the grip.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.07, 0.07);
  magazine.rotation.x = GRIP_RAKE;
  magazine.add(partBox('gun-steel', [0.02, 0.1, 0.032], [0, 0.002, 0]));
  magazine.add(partBox('polymer-black', [0.026, 0.006, 0.044], [0, -0.051, 0]));
  root.add(magazine);

  const grip = anchor(root, [0, -0.072, 0.066], [GRIP_RAKE, 0, 0]);

  return {
    root,
    grip: { anchor: grip, size: GRIP_SIZE, thumb: 'wrapped' },
    trigger: anchor(root, [0.0135, -0.03, -0.004]),
    support: {
      anchor: anchor(grip, [0, -0.006, -FINGER / 2 - 0.002], [0, 0.1, 0]),
      size: [GRIP_SIZE[0] + FINGER * 2 + 0.008, GRIP_SIZE[1] + FINGER + 0.004],
      thumb: 'alongside',
    },
    magazineHand: anchor(magazine, [0, -0.03, 0.004], [0.75, 0.2, 0]),
    magazine,
    magazineTravel: 0.13,
    slide,
    slideTravel: 0.032,
    action: 'slide',
    recoilProfile: 'pistol',
    muzzle: anchor(root, [0, BORE_Y, MUZZLE_Z - 0.002]),
    ejection: anchor(root, [0.014, SLIDE_TOP, -0.01]),
    sight: anchor(root, [0, finalSightY, finalSightZ]),
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.09, -0.088, -0.54),
      rotation: new THREE.Euler(0, 0.035, 0),
    },
    reload: { magazineOut: 0.16, magazineIn: 0.6, slideRelease: 0.84 },
  };
}
