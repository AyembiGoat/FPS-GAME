import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applySurface, surface } from '../materials';

/**
 * The player's two arms. They are not built for any one gun: each hand is placed
 * on a hand anchor (see model.ts) and the elbow is worked out from where the
 * shoulder is. A new gun only has to say where its anchors are.
 *
 * Hand space is the same as anchor space: the origin is the centre of what the
 * hand is wrapped round, +Y runs up toward the thumb, +Z toward the wrist. The
 * right hand is modelled; the left is its mirror image.
 */

const UPPER_ARM = 0.31;
const FOREARM = 0.29;
/** Where the forearm joins the hand, in hand space. */
const WRIST = new THREE.Vector3(0.017, -0.012, 0.092);
/** Shoulder of the right arm, relative to the eye. The left is mirrored. */
const SHOULDER = new THREE.Vector3(0.26, -0.24, 0.14);

function part(geometry: THREE.BufferGeometry, name: 'glove' | 'sleeve'): THREE.Mesh {
  applySurface(geometry, name);
  return new THREE.Mesh(geometry, surface(name));
}

function block(
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const radius = Math.min(...size) * 0.32;
  const mesh = part(new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), 'glove');
  mesh.position.set(...at);
  mesh.rotation.set(...rotation);
  return mesh;
}

/** A right hand closed round a grip about 30 mm wide and 45 mm deep. */
function buildHand(triggerFinger: boolean): THREE.Group {
  const hand = new THREE.Group();
  // The closed fist: palm on the right of the grip, fingers round the front.
  hand.add(block([0.07, 0.078, 0.086], [0.006, -0.014, 0.004]));
  // Knuckle line of the three gripping fingers, showing on the left side.
  for (let i = 0; i < 3; i++) {
    hand.add(block([0.014, 0.021, 0.05], [-0.027, 0.01 - i * 0.024, -0.012]));
  }
  // Web between thumb and index finger, high behind the grip.
  hand.add(block([0.054, 0.03, 0.044], [0.006, 0.032, 0.04]));
  if (triggerFinger) {
    // Index finger along the frame toward the trigger.
    hand.add(block([0.019, 0.019, 0.07], [0.024, 0.036, -0.032], [0.1, 0.1, 0]));
  } else {
    // Index finger curled with the others.
    hand.add(block([0.062, 0.024, 0.07], [0.004, 0.03, -0.004]));
  }
  // Thumb forward along the left side.
  hand.add(block([0.021, 0.021, 0.066], [-0.022, 0.04, 0.0], [0.06, -0.08, 0]));
  // Heel of the hand running back to the wrist.
  hand.add(block([0.064, 0.056, 0.06], [0.016, -0.012, 0.062]));
  return hand;
}

/** A tapered limb along +Y, from y = 0 to y = 1, to be stretched between two joints. */
function limb(radiusStart: number, radiusEnd: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, 1, 16, 1);
  geometry.scale(1, 1, 0.86);
  geometry.translate(0, 0.5, 0);
  // Map at roughly real scale for a limb about 0.3 m long.
  const mesh = new THREE.Mesh(geometry, surface('sleeve'));
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 6);
  return mesh;
}

const UP = new THREE.Vector3(0, 1, 0);

function buildArm(side: -1 | 1) {
  const hand = new THREE.Group();
  // The right hand works the trigger; the left only holds.
  const shape = buildHand(side === 1);
  // A mirrored right hand is a left hand.
  shape.scale.x = side;
  hand.add(shape);

  const cuff = part(new THREE.CylinderGeometry(0.039, 0.037, 0.03, 16), 'glove');
  const forearm = limb(0.04, 0.056);
  const upperArm = limb(0.058, 0.07);
  const elbowCap = part(new THREE.SphereGeometry(0.057, 14, 10), 'sleeve');
  const group = new THREE.Group();
  group.add(hand, cuff, forearm, upperArm, elbowCap);

  const shoulder = new THREE.Vector3(SHOULDER.x * side, SHOULDER.y, SHOULDER.z);
  const wristOffset = new THREE.Vector3(WRIST.x * side, WRIST.y, WRIST.z);
  // Elbows hang down and out to the side.
  const pole = new THREE.Vector3(side * 0.75, -1, 0.1).normalize();
  const wrist = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const reach = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const along = new THREE.Vector3();

  function stretch(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    along.subVectors(to, from);
    const length = along.length();
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(UP, along.divideScalar(length));
    mesh.scale.set(1, length, 1);
  }

  return {
    group,

    /** Put the hand at a position and rotation given in view space, and solve the arm. */
    place(position: THREE.Vector3, rotation: THREE.Quaternion) {
      hand.position.copy(position);
      hand.quaternion.copy(rotation);
      wrist.copy(wristOffset).applyQuaternion(rotation).add(position);

      // Two-bone solve: the elbow sits where both arm lengths fit, pushed toward the pole.
      reach.subVectors(wrist, shoulder);
      const distance = Math.min(reach.length(), (UPPER_ARM + FOREARM) * 0.999);
      reach.normalize();
      const alongReach =
        (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + distance * distance) / (2 * distance);
      const out = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - alongReach * alongReach));
      bend.copy(pole).addScaledVector(reach, -pole.dot(reach)).normalize();
      elbow.copy(shoulder).addScaledVector(reach, alongReach).addScaledVector(bend, out);

      stretch(forearm, wrist, elbow);
      stretch(upperArm, elbow, shoulder);
      elbowCap.position.copy(elbow);
      cuff.position.copy(wrist);
      cuff.quaternion.copy(forearm.quaternion);
    },
  };
}

export function createArms() {
  const right = buildArm(1);
  const left = buildArm(-1);
  const group = new THREE.Group();
  group.add(right.group, left.group);
  return { group, right, left };
}

export type Arms = ReturnType<typeof createArms>;
