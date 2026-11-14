import * as THREE from 'three';
import type { OpticId } from '../../core/weapon';
import { surface } from '../materials';
import type { WeaponModel } from './model';
import { FINGER } from './model';
import {
  anchor,
  barrelCyl,
  buildMountedOptic,
  buildPicatinnyRail,
  fromSideProfile,
  partBox,
  sightDotMaterial,
} from './parts';

/**
 * IMI / Magnum Research Desert Eagle Mark XIX (.50 AE) in brushed satin stainless steel.
 * Faithfully separates the massive fixed triangular-fluted barrel shroud from the rear
 * reciprocating slide, with wraparound black Hogue combat grips and 3-dot combat sights.
 * Overall length 273 mm (noticeably larger and bolder than the 216 mm M1911).
 * Built from reference/arsenal/19-deagle-side.jpg through 21.
 */

const GRIP_RAKE = -0.28;
const GRIP_SIZE = [0.036, 0.062] as const;

function frameProfile(): THREE.Shape {
  const s = new THREE.Shape();
  // Massive Desert Eagle full-length stainless dust cover, squared trigger guard, and wide grip.
  s.moveTo(-0.152, 0.002); // full-length frame nose
  s.lineTo(0.095, 0.002);
  s.lineTo(0.118, -0.004); // deep beavertail tang
  s.lineTo(0.114, -0.014);
  s.lineTo(0.098, -0.028);
  s.lineTo(0.118, -0.124); // backstrap
  s.lineTo(0.056, -0.132); // wide butt
  s.lineTo(0.028, -0.044); // front strap
  s.lineTo(0.018, -0.054);
  s.lineTo(-0.036, -0.054); // squared combat trigger guard bottom
  s.lineTo(-0.046, -0.046); // squared front face
  s.lineTo(-0.046, -0.016);
  s.lineTo(-0.148, -0.016); // heavy under-lug dust cover
  s.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.038, -0.018);
  guard.lineTo(0.014, -0.018);
  guard.lineTo(0.014, -0.046);
  guard.lineTo(-0.034, -0.046);
  guard.closePath();
  s.holes.push(guard);
  return s;
}

function gripPanelProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.034, -0.034);
  s.lineTo(0.094, -0.028);
  s.lineTo(0.112, -0.118);
  s.lineTo(0.056, -0.124);
  s.closePath();
  return s;
}

function fixedBarrelProfile(): THREE.Shape {
  // Iconic heavy triangular-crowned fixed Desert Eagle barrel shroud in (x, y) cross-section.
  const s = new THREE.Shape();
  const half = 0.016;
  const topHalf = 0.011;
  s.moveTo(-half, 0);
  s.lineTo(half, 0);
  s.lineTo(half, 0.016);
  s.lineTo(topHalf, 0.034); // iconic angled triangular barrel flats!
  s.lineTo(-topHalf, 0.034);
  s.lineTo(-half, 0.016);
  s.closePath();
  return s;
}

export function buildDesertEagle(opticId: OpticId = 'irons'): WeaponModel {
  const root = new THREE.Group();

  // Heavy brushed stainless steel lower frame & wraparound black rubberized combat grip panels.
  root.add(
    new THREE.Mesh(
      fromSideProfile(frameProfile(), 0.028, 0.002, 'stainless-steel'),
      surface('stainless-steel'),
    ),
  );
  root.add(
    new THREE.Mesh(
      fromSideProfile(gripPanelProfile(), GRIP_SIZE[0], 0.003, 'polymer-black'),
      surface('polymer-black'),
    ),
  );
  // Black front-strap finger grooves + matte black trigger + exposed steel hammer.
  root.add(partBox('polymer-black', [0.029, 0.072, 0.008], [0, -0.084, 0.042], [GRIP_RAKE, 0, 0]));
  root.add(partBox('steel-dark', [0.007, 0.022, 0.008], [0, -0.031, -0.006], [0.16, 0, 0]));
  root.add(partBox('steel-dark', [0.008, 0.018, 0.012], [0, 0.012, 0.104], [-0.45, 0, 0]));

  // Iconic FIXED massive triangular-fluted stainless barrel assembly (z: -0.162..-0.018).
  const barrelGeom = new THREE.ExtrudeGeometry(fixedBarrelProfile(), {
    depth: 0.146,
    bevelEnabled: false,
  });
  barrelGeom.translate(0, 0.002, -0.162);
  const barrelMesh = new THREE.Mesh(barrelGeom, surface('stainless-steel'));
  root.add(barrelMesh);
  // Full-length top Weaver/Picatinny rail machined along the fixed barrel rib.
  buildPicatinnyRail(root, 0.035, -0.156, -0.024, 'stainless-steel');
  // Massive .50 AE muzzle bore hole!
  root.add(barrelCyl('polymer-black', 0.0072, 0.0072, 0.005, [0, 0.019, -0.163], 14));

  // Front ramped blade combat sight with bright white aiming dot (top at y = 0.0485).
  const sightY = 0.047;
  root.add(partBox('steel-dark', [0.0038, 0.011, 0.018], [0, 0.044, -0.148]));
  const frontDot = new THREE.Mesh(
    new THREE.BoxGeometry(0.0034, 0.0032, 0.002),
    sightDotMaterial(0xffffff),
  );
  frontDot.position.set(0, sightY, -0.139);
  root.add(frontDot);

  // Rear RECIPROCATING stainless steel slide (`slide`: z = -0.018..0.098) with angled serrations!
  const slide = new THREE.Group();
  slide.add(partBox('stainless-steel', [0.032, 0.034, 0.114], [0, 0.019, 0.04]));
  // Rear slanted cocking serrations.
  for (let i = 0; i < 6; i++) {
    slide.add(
      partBox('gun-steel', [0.0332, 0.02, 0.0022], [0, 0.018, 0.045 + i * 0.0068], [0.22, 0, 0]),
    );
  }
  // Ambidextrous wing safety levers on rear of slide.
  slide.add(partBox('steel-dark', [0.04, 0.008, 0.018], [0, 0.022, 0.082]));
  // Combat 3-dot rear sight (wide 4.8 mm U-notch with twin white contrast dots!).
  const rearNotchHalf = 0.0052;
  slide.add(partBox('steel-dark', [0.0065, 0.012, 0.011], [-rearNotchHalf, 0.042, 0.086]));
  slide.add(partBox('steel-dark', [0.0065, 0.012, 0.011], [rearNotchHalf, 0.042, 0.086]));
  slide.add(partBox('steel-dark', [0.018, 0.0035, 0.011], [0, 0.038, 0.086]));
  for (const sx of [-rearNotchHalf, rearNotchHalf]) {
    const dot = new THREE.Mesh(
      new THREE.BoxGeometry(0.0026, 0.0026, 0.0018),
      sightDotMaterial(0xffffff),
    );
    dot.position.set(sx, sightY - 0.001, 0.092);
    slide.add(dot);
  }
  root.add(slide);

  // Removable wide 7-round .50 AE steel magazine.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.072, 0.072);
  magazine.rotation.x = GRIP_RAKE;
  magazine.add(partBox('steel-dark', [0.022, 0.115, 0.048], [0, 0, 0]));
  magazine.add(partBox('polymer-black', [0.028, 0.01, 0.056], [0, -0.06, 0]));
  root.add(magazine);

  // Optional top-rail pistol optic (compact Micro T-2 red dot or heavy hunting ACOG 3.5×!).
  let finalSightY = sightY;
  let finalSightZ = 0.092;
  let aimDistance = 0.34;
  if (opticId !== 'irons') {
    const mounted = buildMountedOptic(root, opticId, 0.041, -0.078, {
      compact: opticId === 'red-dot',
    });
    finalSightY = mounted.sightY;
    finalSightZ = mounted.sightZ;
    aimDistance = opticId === 'acog' ? 0.16 : 0.32;
  }

  // Two-handed modern thumbs-forward pistol grip anchors (scaled to the beefier .50 AE grip).
  const gripAnchor = anchor(root, [0, -0.078, 0.072], [GRIP_RAKE, 0, 0]);
  const trigger = anchor(root, [0.015, -0.031, -0.006]);
  const supportAnchor = anchor(root, [0.002, -0.076, 0.068], [GRIP_RAKE, 0, 0]);
  const magazineHand = anchor(magazine, [0, -0.058, 0]);
  const muzzle = anchor(root, [0, 0.019, -0.166]);
  const ejection = anchor(root, [0.02, 0.024, -0.005]);
  const sight = anchor(root, [0, finalSightY, finalSightZ]);

  return {
    root,
    grip: { anchor: gripAnchor, size: GRIP_SIZE, thumb: 'wrapped' },
    trigger,
    support: {
      anchor: supportAnchor,
      size: [GRIP_SIZE[0], GRIP_SIZE[1] + FINGER * 2.05],
      thumb: 'alongside',
    },
    magazineHand,
    magazine,
    magazineTravel: 0.125,
    slide,
    slideTravel: 0.042,
    action: 'slide',
    recoilProfile: 'hand-cannon',
    muzzle,
    ejection,
    sight,
    aimDistance,
    hip: {
      position: new THREE.Vector3(0.165, -0.18, -0.35),
      rotation: new THREE.Euler(0.035, -0.05, -0.045),
    },
    reload: { magazineOut: 0.22, magazineIn: 0.64, slideRelease: 0.86 },
  };
}
