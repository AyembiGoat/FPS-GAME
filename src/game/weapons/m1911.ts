import * as THREE from 'three';
import { applySurface, surface, surfaceMesh } from '../materials';
import type { WeaponModel } from './model';
import { FINGER } from './model';

/**
 * M1911 pistol, built from reference/m1911.png (side) and reference/m1911-rear.png
 * (the view the player has of it).
 *
 * Gun space is described in model.ts. The top of the frame is y = 0. Dimensions
 * follow the real pistol: 216 mm long, 23 mm across the slide.
 */

const SLIDE_WIDTH = 0.023;
const SLIDE_HEIGHT = 0.028;
const FRAME_WIDTH = 0.019;
const MUZZLE_Z = -0.105;
const SLIDE_TRAVEL = 0.03;

/** Extrude a side profile drawn in (z, y) so that its thickness runs along X. */
function fromSideProfile(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

function frameProfile(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.058, 0);
  shape.lineTo(0.082, 0);
  shape.lineTo(0.1, -0.004); // grip safety tang
  shape.lineTo(0.098, -0.01);
  shape.lineTo(0.084, -0.022);
  shape.lineTo(0.086, -0.05); // back strap
  shape.lineTo(0.1, -0.105);
  shape.lineTo(0.05, -0.112); // butt
  shape.lineTo(0.024, -0.034); // front strap
  shape.lineTo(0.018, -0.046);
  shape.lineTo(-0.022, -0.048); // trigger guard
  shape.lineTo(-0.034, -0.038);
  shape.lineTo(-0.036, -0.014);
  shape.lineTo(-0.058, -0.013); // dust cover
  shape.closePath();

  const guard = new THREE.Path();
  guard.moveTo(-0.03, -0.019);
  guard.lineTo(0.014, -0.019);
  guard.lineTo(0.014, -0.042);
  guard.lineTo(-0.022, -0.043);
  guard.lineTo(-0.03, -0.036);
  guard.closePath();
  shape.holes.push(guard);
  return shape;
}

function gripPanelProfile(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0.031, -0.03);
  shape.lineTo(0.08, -0.025);
  shape.lineTo(0.095, -0.1);
  shape.lineTo(0.05, -0.106);
  shape.closePath();
  return shape;
}

function slideGeometry(): THREE.BufferGeometry {
  const w = SLIDE_WIDTH / 2;
  const chamfer = 0.005;
  const section = new THREE.Shape();
  section.moveTo(-w, 0);
  section.lineTo(w, 0);
  section.lineTo(w, SLIDE_HEIGHT - chamfer);
  section.lineTo(w - chamfer, SLIDE_HEIGHT);
  section.lineTo(-w + chamfer, SLIDE_HEIGHT);
  section.lineTo(-w, SLIDE_HEIGHT - chamfer);
  section.closePath();
  const geometry = new THREE.ExtrudeGeometry(section, { depth: 0.19, bevelEnabled: false });
  geometry.translate(0, 0, MUZZLE_Z);
  return geometry;
}

function box(
  material: THREE.Material,
  size: readonly [number, number, number],
  at: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  return mesh;
}

function anchor(
  parent: THREE.Object3D,
  at: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.set(...at);
  object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

/** The grip leans back toward the shooter as it goes down. */
const GRIP_RAKE = -0.26;
/** Width across the grip panels, and depth from front strap to back strap. */
const GRIP_SIZE = [0.029, 0.054] as const;

export function buildM1911(): WeaponModel {
  const steel = surface('gun-steel');
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x2b2a29,
    metalness: 0.6,
    roughness: 0.5,
  });

  const root = new THREE.Group();
  root.add(surfaceMesh(fromSideProfile(frameProfile(), FRAME_WIDTH, 0.0012), 'gun-steel'));

  const panelGeometry = fromSideProfile(gripPanelProfile(), 0.0045, 0.001);
  applySurface(panelGeometry, 'walnut');
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(panelGeometry, surface('walnut'));
    panel.position.x = side * (FRAME_WIDTH / 2 + 0.002);
    root.add(panel);
    for (const [z, y] of [
      [0.058, -0.038],
      [0.071, -0.092],
    ] as const) {
      const screw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0025, 0.0025, 0.0012, 10),
        darkSteel,
      );
      screw.rotation.z = Math.PI / 2;
      screw.position.set(side * (FRAME_WIDTH / 2 + 0.0047), y, z);
      root.add(screw);
    }
  }

  root.add(box(darkSteel, [0.006, 0.017, 0.005], [0, -0.0275, 0.0]));
  // Controls on the left side, which is the side the player sees.
  root.add(box(darkSteel, [0.003, 0.005, 0.032], [-0.0108, -0.004, 0.012]));
  root.add(box(darkSteel, [0.004, 0.007, 0.02], [-0.0112, -0.003, 0.068]));
  const hammer = box(darkSteel, [0.006, 0.018, 0.006], [0, 0.012, 0.092]);
  hammer.rotation.x = 0.55;
  root.add(hammer);

  // Everything that moves back when the gun cycles.
  const slide = new THREE.Group();
  slide.add(surfaceMesh(slideGeometry(), 'gun-steel'));
  slide.add(box(steel, [FRAME_WIDTH, 0.013, 0.047], [0, -0.0065, MUZZLE_Z + 0.0235]));
  slide.add(box(darkSteel, [0.003, 0.0045, 0.009], [0, SLIDE_HEIGHT + 0.002, MUZZLE_Z + 0.01]));
  // Rear sight: two posts with the notch between them.
  for (const side of [-1, 1]) {
    slide.add(box(darkSteel, [0.005, 0.005, 0.008], [side * 0.0045, SLIDE_HEIGHT + 0.0022, 0.072]));
  }
  slide.add(box(darkSteel, [0.014, 0.002, 0.008], [0, SLIDE_HEIGHT + 0.0007, 0.072]));
  // Ejection port on the top right.
  slide.add(box(darkSteel, [0.011, 0.008, 0.03], [0.0062, SLIDE_HEIGHT - 0.0038, -0.014]));
  // Cocking serrations.
  const serration = new THREE.BoxGeometry(0.0008, 0.017, 0.0016);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const ridge = new THREE.Mesh(serration, steel);
      ridge.position.set(side * (SLIDE_WIDTH / 2 + 0.0002), 0.0125, 0.034 + i * 0.0036);
      slide.add(ridge);
    }
  }
  root.add(slide);

  // The magazine sits inside the grip; only its base plate shows until it is removed.
  const magazine = new THREE.Group();
  magazine.position.set(0, -0.066, 0.068);
  magazine.rotation.x = GRIP_RAKE;
  magazine.add(box(darkSteel, [0.012, 0.094, 0.03], [0, 0.002, 0]));
  magazine.add(box(darkSteel, [0.017, 0.005, 0.04], [0, -0.0475, 0]));
  root.add(magazine);

  const grip = anchor(root, [0, -0.068, 0.0635], [GRIP_RAKE, 0, 0]);

  return {
    root,
    grip: { anchor: grip, size: GRIP_SIZE, thumb: 'wrapped' },
    trigger: anchor(root, [0.0125, -0.027, -0.006]),
    // The left hand closes over the firing hand's fingers, one finger lower, so the box
    // it holds is the grip plus a finger's thickness on the front and on each side.
    support: {
      anchor: anchor(grip, [0, -0.0185, -FINGER / 2 - 0.002], [0, 0.1, 0]),
      size: [GRIP_SIZE[0] + FINGER * 2 + 0.008, GRIP_SIZE[1] + FINGER + 0.004],
      thumb: 'alongside',
    },
    // Holding the lower half of the magazine, wrist coming up from below.
    magazineHand: anchor(magazine, [0, -0.03, 0.004], [0.75, 0.2, 0]),
    magazine,
    magazineTravel: 0.125,
    slide,
    slideTravel: SLIDE_TRAVEL,
    muzzle: anchor(root, [0, 0.016, MUZZLE_Z]),
    ejection: anchor(root, [0.012, SLIDE_HEIGHT, -0.014]),
    sight: anchor(root, [0, SLIDE_HEIGHT + 0.0047, 0.076]),
    aimDistance: 0.42,
    hip: {
      position: new THREE.Vector3(0.09, -0.088, -0.54),
      rotation: new THREE.Euler(0, 0.035, 0),
    },
    reload: { magazineOut: 0.16, magazineIn: 0.6, slideRelease: 0.84 },
  };
}
