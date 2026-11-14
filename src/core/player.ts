/**
 * Deterministic first-person player movement.
 *
 * Pure: same (state, input, dt, solids) always produces the same result.
 * Right-handed, Y up, metres and seconds. Yaw 0 looks down -Z; positive yaw turns left.
 */

import type { Box } from './collision';
import { moveBody, overlaps } from './collision';
import type { Vec3 } from './vec';
import { clamp } from './vec';

export interface PlayerState {
  /** Position of the player's feet. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly grounded: boolean;
  /** Seconds left in which a jump is still allowed after walking off a ledge. */
  readonly coyote: number;
  /** Seconds left in which an early jump press will still fire on landing. */
  readonly jumpBuffer: number;
  readonly jumpHeld: boolean;
  /** Metres the head is currently leaned to the side. Negative is left. */
  readonly lean: number;
}

export interface PlayerInput {
  /** -1 (back) .. 1 (forward). */
  readonly forward: number;
  /** -1 (left) .. 1 (right). */
  readonly right: number;
  readonly jump: boolean;
  readonly sprint: boolean;
  /** Look deltas in radians accumulated since the last step. */
  readonly yawDelta: number;
  readonly pitchDelta: number;
  /** -1 leans left, 1 leans right, 0 stands straight. */
  readonly lean: number;
  /** Aiming down the sights. Slows movement and rules out sprinting. */
  readonly aim: boolean;
}

export const PLAYER_TUNING = {
  walkSpeed: 5.2,
  sprintSpeed: 7.6,
  /** High values make starts and stops feel immediate rather than floaty. */
  groundAcceleration: 70,
  groundFriction: 55,
  airAcceleration: 14,
  jumpSpeed: 6.3,
  gravity: 20,
  radius: 0.3,
  height: 1.8,
  eyeHeight: 1.65,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,
  maxPitch: Math.PI / 2 - 0.01,
  /** How far the head moves sideways at full lean. */
  leanDistance: 0.42,
  /** Metres per second the head moves while leaning in or out. */
  leanSpeed: 3,
  /** The head drops slightly at full lean, as the body tilts. */
  leanDrop: 0.05,
  /** Half-width of the space the head needs, so a lean never puts the eye in a wall. */
  headRadius: 0.14,
  aimSpeedFactor: 0.55,
} as const;

export const NO_INPUT: PlayerInput = {
  forward: 0,
  right: 0,
  jump: false,
  sprint: false,
  yawDelta: 0,
  pitchDelta: 0,
  lean: 0,
  aim: false,
};

export function createPlayer(position: Vec3 = { x: 0, y: 0, z: 0 }, yaw = 0): PlayerState {
  return {
    position,
    velocity: { x: 0, y: 0, z: 0 },
    yaw,
    pitch: 0,
    grounded: true,
    coyote: PLAYER_TUNING.coyoteTime,
    jumpBuffer: 0,
    jumpHeld: false,
    lean: 0,
  };
}

/** Where the eye is for a body at `feet` facing `yaw`, leaned `lean` metres sideways. */
export function eyeAt(feet: Vec3, yaw: number, lean: number): Vec3 {
  const t = PLAYER_TUNING;
  const drop = (Math.abs(lean) / t.leanDistance) * t.leanDrop;
  return {
    x: feet.x + Math.cos(yaw) * lean,
    y: feet.y + t.eyeHeight - drop,
    z: feet.z - Math.sin(yaw) * lean,
  };
}

export function eyePosition(player: PlayerState): Vec3 {
  return eyeAt(player.position, player.yaw, player.lean);
}

const LEAN_PROBE_STEP = 0.03;

/**
 * How far the head can lean to one side (-1 left, 1 right) before it would enter a
 * solid. The head is moved out in small steps and stops at the last clear one, so
 * the camera can never end up inside or looking through a wall.
 */
export function leanRoom(feet: Vec3, yaw: number, side: -1 | 1, solids: readonly Box[]): number {
  const t = PLAYER_TUNING;
  let room = 0;
  for (let d = LEAN_PROBE_STEP; d <= t.leanDistance + 1e-9; d += LEAN_PROBE_STEP) {
    const eye = eyeAt(feet, yaw, side * d);
    const head: Box = {
      min: { x: eye.x - t.headRadius, y: eye.y - 0.2, z: eye.z - t.headRadius },
      max: { x: eye.x + t.headRadius, y: eye.y + t.headRadius, z: eye.z + t.headRadius },
    };
    if (solids.some((solid) => overlaps(head, solid))) break;
    room = d;
  }
  return room;
}

export interface PlayerStep {
  readonly state: PlayerState;
  readonly jumped: boolean;
  /** Downward speed at the moment of landing, or null if the player did not land. */
  readonly landedSpeed: number | null;
}

export function stepPlayer(
  state: PlayerState,
  input: PlayerInput,
  dt: number,
  solids: readonly Box[],
): PlayerStep {
  const t = PLAYER_TUNING;
  const yaw = state.yaw + input.yawDelta;
  const pitch = clamp(state.pitch + input.pitchDelta, -t.maxPitch, t.maxPitch);

  // Normalise so diagonal movement is not faster than straight movement.
  let moveForward = clamp(input.forward, -1, 1);
  let moveRight = clamp(input.right, -1, 1);
  const inputLength = Math.hypot(moveForward, moveRight);
  if (inputLength > 1) {
    moveForward /= inputLength;
    moveRight /= inputLength;
  }
  const moving = inputLength > 0;

  let speed: number = t.walkSpeed;
  if (input.aim) speed *= t.aimSpeedFactor;
  else if (input.sprint && moveForward > 0) speed = t.sprintSpeed;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const wishX = (-sin * moveForward + cos * moveRight) * speed;
  const wishZ = (-cos * moveForward - sin * moveRight) * speed;

  // Move horizontal velocity toward the wished velocity at a fixed rate. In the air
  // with no input the player keeps their momentum.
  let rate = 0;
  if (state.grounded) rate = moving ? t.groundAcceleration : t.groundFriction;
  else if (moving) rate = t.airAcceleration;

  let vx = state.velocity.x;
  let vz = state.velocity.z;
  const diffX = wishX - vx;
  const diffZ = wishZ - vz;
  const diff = Math.hypot(diffX, diffZ);
  const maxChange = rate * dt;
  if (diff <= maxChange) {
    vx = wishX;
    vz = wishZ;
  } else if (diff > 0) {
    vx += (diffX / diff) * maxChange;
    vz += (diffZ / diff) * maxChange;
  }

  const pressedJump = input.jump && !state.jumpHeld;
  let jumpBuffer = pressedJump ? t.jumpBufferTime : Math.max(0, state.jumpBuffer - dt);
  let coyote = state.coyote;
  let vy = state.velocity.y;
  let jumped = false;
  if (jumpBuffer > 0 && coyote > 0) {
    vy = t.jumpSpeed;
    jumpBuffer = 0;
    coyote = 0;
    jumped = true;
  }
  vy -= t.gravity * dt;

  const move = moveBody(
    state.position,
    { x: vx * dt, y: vy * dt, z: vz * dt },
    t.radius,
    t.height,
    solids,
  );

  let landedSpeed: number | null = null;
  if (move.hitFloor) {
    if (!state.grounded) landedSpeed = -vy;
    vy = 0;
    coyote = t.coyoteTime;
  } else {
    coyote = Math.max(0, coyote - dt);
    if (move.hitCeiling) vy = 0;
  }
  if (move.hitX) vx = 0;
  if (move.hitZ) vz = 0;

  // Lean toward the side being held, then pull back in if a wall is in the way. The
  // limit is checked every step, so walking toward a wall while leaned pushes the
  // head back rather than letting it pass through.
  const wanted = Math.sign(input.lean) * t.leanDistance;
  const change = t.leanSpeed * dt;
  let lean = state.lean + clamp(wanted - state.lean, -change, change);
  if (lean > 0) lean = Math.min(lean, leanRoom(move.position, yaw, 1, solids));
  else if (lean < 0) lean = Math.max(lean, -leanRoom(move.position, yaw, -1, solids));

  return {
    state: {
      position: move.position,
      velocity: { x: vx, y: vy, z: vz },
      yaw,
      pitch,
      grounded: move.hitFloor,
      coyote,
      jumpBuffer,
      jumpHeld: input.jump,
      lean,
    },
    jumped,
    landedSpeed,
  };
}
