import type { Vec3 } from './vec';

/** Axis-aligned box. All level collision is built from these. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

// Boxes that only touch do not count as overlapping. Without this, a body resting
// exactly against a wall would be treated as inside it on the next step.
const TOUCH = 1e-6;

export function overlaps(a: Box, b: Box): boolean {
  return (
    a.max.x > b.min.x + TOUCH &&
    a.min.x < b.max.x - TOUCH &&
    a.max.y > b.min.y + TOUCH &&
    a.min.y < b.max.y - TOUCH &&
    a.max.z > b.min.z + TOUCH &&
    a.min.z < b.max.z - TOUCH
  );
}

/** The box occupied by an upright body whose feet are at `feet`. */
export function bodyBox(feet: Vec3, radius: number, height: number): Box {
  return {
    min: { x: feet.x - radius, y: feet.y, z: feet.z - radius },
    max: { x: feet.x + radius, y: feet.y + height, z: feet.z + radius },
  };
}

/** True when an upright body at `feet` overlaps any box in `solids`. */
export function collidesAt(
  feet: Vec3,
  radius: number,
  height: number,
  solids: readonly Box[],
): boolean {
  const box = bodyBox(feet, radius, height);
  for (const solid of solids) {
    if (overlaps(box, solid)) return true;
  }
  return false;
}

export interface MoveResult {
  readonly position: Vec3;
  readonly hitX: boolean;
  readonly hitZ: boolean;
  readonly hitFloor: boolean;
  readonly hitCeiling: boolean;
}

/**
 * Move a body by `delta`, stopping at solids. Each axis is resolved on its own so
 * the body slides along a wall instead of sticking to it. Assumes the per-step
 * movement is smaller than the body, which holds at any sane speed at 60 Hz.
 */
export function moveBody(
  feet: Vec3,
  delta: Vec3,
  radius: number,
  height: number,
  solids: readonly Box[],
): MoveResult {
  let { x, y, z } = feet;
  let hitX = false;
  let hitZ = false;
  let hitFloor = false;
  let hitCeiling = false;

  if (delta.x !== 0) {
    x += delta.x;
    const box = bodyBox({ x, y, z }, radius, height);
    for (const solid of solids) {
      if (!overlaps(box, solid)) continue;
      x = delta.x > 0 ? Math.min(x, solid.min.x - radius) : Math.max(x, solid.max.x + radius);
      hitX = true;
    }
  }

  if (delta.z !== 0) {
    z += delta.z;
    const box = bodyBox({ x, y, z }, radius, height);
    for (const solid of solids) {
      if (!overlaps(box, solid)) continue;
      z = delta.z > 0 ? Math.min(z, solid.min.z - radius) : Math.max(z, solid.max.z + radius);
      hitZ = true;
    }
  }

  if (delta.y !== 0) {
    y += delta.y;
    const box = bodyBox({ x, y, z }, radius, height);
    for (const solid of solids) {
      if (!overlaps(box, solid)) continue;
      if (delta.y < 0) {
        y = Math.max(y, solid.max.y);
        hitFloor = true;
      } else {
        y = Math.min(y, solid.min.y - height);
        hitCeiling = true;
      }
    }
  }

  return { position: { x, y, z }, hitX, hitZ, hitFloor, hitCeiling };
}

export interface RayHit {
  readonly distance: number;
  /** Index into the `boxes` array that was passed in. */
  readonly index: number;
  /** Unit normal of the face that was hit. */
  readonly normal: Vec3;
}

const AXES = ['x', 'y', 'z'] as const;

/** Nearest box hit by a ray, or null. `direction` must be unit length. */
export function raycast(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  boxes: readonly Box[],
): RayHit | null {
  let best: RayHit | null = null;

  boxes.forEach((box, index) => {
    let near = -Infinity;
    let far = Infinity;
    let nearAxis: (typeof AXES)[number] = 'x';

    for (const axis of AXES) {
      const o = origin[axis];
      const d = direction[axis];
      if (Math.abs(d) < 1e-12) {
        if (o < box.min[axis] || o > box.max[axis]) return;
        continue;
      }
      const t1 = (box.min[axis] - o) / d;
      const t2 = (box.max[axis] - o) / d;
      const enter = Math.min(t1, t2);
      const exit = Math.max(t1, t2);
      if (enter > near) {
        near = enter;
        nearAxis = axis;
      }
      far = Math.min(far, exit);
      if (near > far) return;
    }

    // near < 0 means the ray starts inside the box; that is not a hit.
    if (near < 0 || near > maxDistance) return;
    if (best && best.distance <= near) return;

    const sign = direction[nearAxis] > 0 ? -1 : 1;
    best = {
      distance: near,
      index,
      normal: {
        x: nearAxis === 'x' ? sign : 0,
        y: nearAxis === 'y' ? sign : 0,
        z: nearAxis === 'z' ? sign : 0,
      },
    };
  });

  return best;
}
