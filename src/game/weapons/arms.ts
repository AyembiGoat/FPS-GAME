import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applySurface, surface } from '../materials';
import type { Handhold, WeaponModel } from './model';
import { FINGER } from './model';

/**
 * The player's two arms. They are not built for any one gun. Each hand is shaped
 * round the handhold the gun describes (see model.ts): the fingers follow the
 * surface of that box a hair's width away, so they close on it without passing
 * through. The elbow is then worked out from where the shoulder is.
 *
 * Built from reference/hands-view.png and reference/hands-side.png.
 *
 * Hand space is handhold space: origin at the centre of what is held, +Y toward
 * the thumb, +Z toward the wrist. The right hand is modelled, palm on +X; the left
 * is its mirror image.
 */

const UPPER_ARM = 0.33;
const FOREARM = 0.3;
/** Shoulder of the right arm, relative to the eye. The left is mirrored. */
const SHOULDER = new THREE.Vector3(0.22, -0.3, 0.08);

const FINGER_RADIUS = FINGER / 2;
const THUMB_RADIUS = 0.0105;
/** Air between a finger and what it holds. */
const GAP = 0.001;
/** Height of each finger above the centre of the handhold, index first. */
const FINGER_ROWS = [0.028, 0.0095, -0.009, -0.0275] as const;
/** Knuckle to fingertip, index first. */
const FINGER_LENGTHS = [0.1, 0.108, 0.1, 0.084] as const;
/** How far behind the front of the handhold the knuckles sit. */
const KNUCKLE_BACK = 0.014;

type Point = readonly [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A finger: a run of rounded segments through `points`, thinning toward the tip.
 * Corners are cut so the finger bends over two joints, and the run stops at `length`.
 */
function digit(points: readonly Point[], radius: number, length: number): THREE.BufferGeometry[] {
  const path = points.map((point) => new THREE.Vector3(...point));
  const bent: THREE.Vector3[] = [];
  path.forEach((point, i) => {
    const before = path[i - 1];
    const after = path[i + 1];
    if (!before || !after) {
      bent.push(point);
      return;
    }
    const cut = radius * 0.7;
    bent.push(
      point.clone().add(before.clone().sub(point).setLength(cut)),
      point.clone().add(after.clone().sub(point).setLength(cut)),
    );
  });

  const segments: THREE.BufferGeometry[] = [];
  let travelled = 0;
  for (let i = 0; i < bent.length - 1 && travelled < length; i++) {
    const from = bent[i];
    const to = bent[i + 1];
    if (!from || !to) break;
    const along = to.clone().sub(from);
    const span = Math.min(along.length(), length - travelled);
    if (span < 0.002) break;
    along.normalize();
    // The tip is about four fifths as thick as the base.
    const thickness = radius * (1 - 0.2 * ((travelled + span / 2) / length));
    const capsule = new THREE.CapsuleGeometry(thickness, span, 4, 12);
    capsule.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, along));
    capsule.translate(
      from.x + along.x * (span / 2),
      from.y + along.y * (span / 2),
      from.z + along.z * (span / 2),
    );
    segments.push(capsule);
    travelled += span;
  }
  return segments;
}

/** A rounded block given by its lowest and highest corner. */
function pad(min: Point, max: Point, radius: number): THREE.BufferGeometry {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as const;
  const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 4, radius);
  geometry.translate(min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2);
  return geometry;
}

/**
 * A right hand closed round `hold`. `triggerTip`, in hand space, is where the index
 * fingertip rests; without it the index finger closes with the others.
 */
function buildHand(hold: Handhold, triggerTip: THREE.Vector3 | null) {
  const halfWidth = hold.size[0] / 2 + GAP;
  const halfDepth = hold.size[1] / 2 + GAP;
  // Centre lines of a finger lying on the palm side, the front and the far side.
  const near = halfWidth + FINGER_RADIUS;
  const front = -(halfDepth + FINGER_RADIUS);
  const far = -(halfWidth + FINGER_RADIUS);
  const knuckleZ = front + KNUCKLE_BACK;
  const parts: THREE.BufferGeometry[] = [];

  FINGER_ROWS.forEach((y, finger) => {
    const length = FINGER_LENGTHS[finger] ?? 0.1;
    if (finger === 0 && triggerTip) {
      // Straight along the frame, rising to the trigger.
      const knuckle = new THREE.Vector3(near, y, knuckleZ);
      const first = knuckle.clone().lerp(triggerTip, 0.42).setX(near);
      const second = knuckle
        .clone()
        .lerp(triggerTip, 0.76)
        .setX((near + triggerTip.x) / 2);
      parts.push(
        ...digit(
          [knuckle.toArray(), first.toArray(), second.toArray(), triggerTip.toArray()],
          FINGER_RADIUS,
          length,
        ),
      );
      return;
    }
    // Along the palm side, across the front, and back along the far side. Round
    // something too wide to reach round, the fingertip stops on the front.
    const reachesRound = KNUCKLE_BACK + (near - far) + 0.02 < length;
    parts.push(
      ...digit(
        reachesRound
          ? [
              [near, y, knuckleZ],
              [near, y, front],
              [far, y, front],
              [far, y, front + 0.05],
            ]
          : [
              [near, y, knuckleZ],
              [near, y, front],
              [far + FINGER_RADIUS, y, front],
            ],
        FINGER_RADIUS * (finger === 3 ? 0.9 : 1),
        length,
      ),
    );
  });

  if (hold.thumb === 'wrapped') {
    // From the palm, behind the grip, then forward along the far side.
    const farThumb = -(halfWidth + THUMB_RADIUS);
    const behind = halfDepth + THUMB_RADIUS + 0.002;
    parts.push(
      ...digit(
        [
          [halfWidth + 0.012, 0.022, behind + 0.006],
          [farThumb, 0.04, behind],
          [farThumb, 0.046, -0.004],
          [farThumb + 0.001, 0.048, -0.034],
        ],
        THUMB_RADIUS,
        0.112,
      ),
    );
  } else {
    // Forward along the top of the palm, on the palm's own side.
    const beside = halfWidth + THUMB_RADIUS;
    parts.push(
      ...digit(
        [
          [beside + 0.008, 0.026, halfDepth + 0.016],
          [beside + 0.002, 0.04, 0.014],
          [beside, 0.042, -0.018],
          [beside, 0.042, -0.046],
        ],
        THUMB_RADIUS,
        0.1,
      ),
    );
  }

  const top = FINGER_ROWS[0] + FINGER_RADIUS + 0.002;
  const bottom = FINGER_ROWS[3] - FINGER_RADIUS - 0.001;
  const back = halfDepth + 0.036;
  // Palm and back of the hand, lying flat against the side of what is held.
  parts.push(pad([halfWidth, bottom, knuckleZ - 0.006], [halfWidth + 0.026, top, back], 0.009));
  if (hold.thumb === 'wrapped') {
    // The web and heel of the hand, closed round the back of the grip.
    parts.push(
      pad(
        [-halfWidth * 0.7, bottom + 0.012, halfDepth + 0.0005],
        [halfWidth + 0.02, 0.03, halfDepth + 0.03],
        0.011,
      ),
    );
  }
  // Padded knuckle guard across the back of the knuckles.
  parts.push(
    pad(
      [halfWidth + 0.016, bottom + 0.003, knuckleZ - 0.012],
      [halfWidth + 0.03, top - 0.002, knuckleZ + 0.012],
      0.006,
    ),
  );
  // Heel of the hand narrowing to the wrist.
  parts.push(
    pad(
      [halfWidth - 0.003, bottom + 0.008, back - 0.014],
      [halfWidth + 0.031, top - 0.006, back + 0.03],
      0.012,
    ),
  );

  const merged = mergeGeometries(parts.map((geometry) => geometry.toNonIndexed()));
  applySurface(merged, 'glove');
  return {
    mesh: new THREE.Mesh(merged, surface('glove')),
    /** Where the forearm joins, in hand space. */
    wrist: new THREE.Vector3(halfWidth + 0.014, (top + bottom) / 2 + 0.002, back + 0.03),
  };
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

function buildArm(side: -1 | 1, hold: Handhold, triggerTip: THREE.Vector3 | null) {
  const hand = new THREE.Group();
  const shape = buildHand(hold, triggerTip);
  // A mirrored right hand is a left hand.
  shape.mesh.scale.x = side;
  hand.add(shape.mesh);

  // Wider than the sleeve all the way round, so the two never share a surface.
  const cuffGeometry = new THREE.CylinderGeometry(0.036, 0.0345, 0.03, 20);
  cuffGeometry.scale(1, 1, 0.86);
  applySurface(cuffGeometry, 'glove');
  const cuff = new THREE.Mesh(cuffGeometry, surface('glove'));
  const forearm = limb(0.033, 0.052);
  const upperArm = limb(0.054, 0.066);
  const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.053, 14, 10), surface('sleeve'));
  const group = new THREE.Group();
  group.add(hand, cuff, forearm, upperArm, elbowCap);

  const shoulder = new THREE.Vector3(SHOULDER.x * side, SHOULDER.y, SHOULDER.z);
  const wristOffset = shape.wrist.clone();
  wristOffset.x *= side;
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

/** Arms shaped for one gun's handholds. */
export function createArms(model: WeaponModel) {
  model.root.updateMatrixWorld(true);
  const triggerTip = model.grip.anchor.worldToLocal(
    model.trigger.getWorldPosition(new THREE.Vector3()),
  );
  const right = buildArm(1, model.grip, triggerTip);
  const left = buildArm(-1, model.support, null);
  const group = new THREE.Group();
  group.add(right.group, left.group);
  return { group, right, left };
}

export type Arms = ReturnType<typeof createArms>;
