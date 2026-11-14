import type { GameInput } from '../core/game';

const MOUSE_SENSITIVITY = 0.0021;

/**
 * Keyboard and mouse, only while the pointer is captured.
 *
 * Presses are latched until the next simulation step reads them, so a click that
 * goes down and up between two steps still fires.
 */
export function createHumanInput(canvas: HTMLCanvasElement) {
  const held = new Set<string>();
  const pressed = new Set<string>();
  let yaw = 0;
  let pitch = 0;

  const locked = () => document.pointerLockElement === canvas;
  const down = (code: string) => {
    held.add(code);
    pressed.add(code);
  };
  const active = (code: string) => held.has(code) || pressed.has(code);

  document.addEventListener('keydown', (event) => {
    if (!locked()) return;
    if (!event.repeat) down(event.code);
    event.preventDefault();
  });
  document.addEventListener('keyup', (event) => held.delete(event.code));
  document.addEventListener('mousedown', (event) => {
    if (locked() && event.button === 0) down('Fire');
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) held.delete('Fire');
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked()) return;
    yaw -= event.movementX * MOUSE_SENSITIVITY;
    pitch -= event.movementY * MOUSE_SENSITIVITY;
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) {
      held.clear();
      pressed.clear();
    }
  });

  const axis = (positive: string, negative: string) =>
    (active(positive) ? 1 : 0) - (active(negative) ? 1 : 0);

  return {
    locked,

    /** Look that has not been handed to the simulation yet. */
    pendingLook: () => ({ yaw, pitch }),

    /** Read and consume input for one simulation step. */
    sample(): GameInput {
      const input: GameInput = {
        forward: axis('KeyW', 'KeyS'),
        right: axis('KeyD', 'KeyA'),
        jump: active('Space'),
        sprint: active('ShiftLeft'),
        fire: active('Fire'),
        reload: active('KeyR'),
        yawDelta: yaw,
        pitchDelta: pitch,
      };
      pressed.clear();
      yaw = 0;
      pitch = 0;
      return input;
    },
  };
}
