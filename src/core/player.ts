/**
 * Deterministic first-person player movement.
 *
 * Pure: same (state, input, dt) always produces the same result. No rendering,
 * no browser APIs. Coordinates are right-handed, Y up, metres and seconds.
 * Yaw 0 looks down -Z; positive yaw turns left.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerState {
  /** Position of the player's feet. */
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Radians around +Y. */
  readonly yaw: number;
  /** Radians, clamped to just under straight up/down. */
  readonly pitch: number;
  readonly grounded: boolean;
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
}

export const PLAYER_TUNING = {
  walkSpeed: 5,
  sprintSpeed: 8,
  jumpSpeed: 5.5,
  gravity: 18,
  eyeHeight: 1.7,
  maxPitch: Math.PI / 2 - 0.01,
} as const;

export const NO_INPUT: PlayerInput = {
  forward: 0,
  right: 0,
  jump: false,
  sprint: false,
  yawDelta: 0,
  pitchDelta: 0,
};

export function createPlayer(position: Vec3 = { x: 0, y: 0, z: 0 }): PlayerState {
  return {
    position,
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: position.y <= 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Advance the player by `dt` seconds on an infinite ground plane at y = 0. */
export function stepPlayer(state: PlayerState, input: PlayerInput, dt: number): PlayerState {
  const yaw = state.yaw + input.yawDelta;
  const pitch = clamp(
    state.pitch + input.pitchDelta,
    -PLAYER_TUNING.maxPitch,
    PLAYER_TUNING.maxPitch,
  );

  // Normalise so diagonal movement is not faster than straight movement.
  let moveForward = clamp(input.forward, -1, 1);
  let moveRight = clamp(input.right, -1, 1);
  const length = Math.hypot(moveForward, moveRight);
  if (length > 1) {
    moveForward /= length;
    moveRight /= length;
  }

  const speed = input.sprint ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const vx = (-sin * moveForward + cos * moveRight) * speed;
  const vz = (-cos * moveForward - sin * moveRight) * speed;

  let vy = state.velocity.y;
  if (state.grounded && input.jump) {
    vy = PLAYER_TUNING.jumpSpeed;
  }
  vy -= PLAYER_TUNING.gravity * dt;

  let y = state.position.y + vy * dt;
  let grounded = false;
  if (y <= 0) {
    y = 0;
    vy = 0;
    grounded = true;
  }

  return {
    position: { x: state.position.x + vx * dt, y, z: state.position.z + vz * dt },
    velocity: { x: vx, y: vy, z: vz },
    yaw,
    pitch,
    grounded,
  };
}
