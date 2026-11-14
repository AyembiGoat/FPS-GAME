import type { GameInput } from '../core/game';

const BASE_MOUSE_SENSITIVITY = 0.0021;

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
  let zoom = 1;
  let aimBlend = 0;
  let mouseMultiplier = 1;
  let adsMultiplier = 1;

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
    if (!locked()) return;
    if (event.button === 0) down('Fire');
    if (event.button === 2) down('Aim');
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) held.delete('Fire');
    if (event.button === 2) held.delete('Aim');
  });
  // Right mouse is aim, so it must not open the browser menu.
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked()) return;
    // Zoomed in, the same hand movement turns the view less, scaled further by ADS preference.
    const adsFactor = 1 + (adsMultiplier - 1) * aimBlend;
    const scale = (BASE_MOUSE_SENSITIVITY * mouseMultiplier * adsFactor) / zoom;
    yaw -= event.movementX * scale;
    pitch -= event.movementY * scale;
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

    /** Tell the mouse how far the view is zoomed in and how far sights are raised. */
    setAimState(currentZoom: number, currentAim: number) {
      zoom = currentZoom;
      aimBlend = Math.max(0, Math.min(1, currentAim));
    },

    setSensitivity(hipfire: number, ads: number) {
      mouseMultiplier = hipfire;
      adsMultiplier = ads;
    },

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
        aim: active('Aim'),
        // Holding both keys cancels out.
        lean: axis('KeyE', 'KeyQ'),
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
