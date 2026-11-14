import type { GameInput } from '../core/game';
import type { WeaponSlot } from '../core/weapon';

const BASE_MOUSE_SENSITIVITY = 0.0021;
const SCROLL_SWITCH_DEBOUNCE_MS = 140;

export type InputMode = 'hold' | 'toggle';

/**
 * Keyboard and mouse, only while the pointer is captured.
 *
 * Presses are latched until the next simulation step reads them, so a click that
 * goes down and up between two steps still fires. Supports wired Hold/Toggle Aim,
 * Hold/Toggle Lean, and Primary/Secondary weapon switching via 1/2 or scroll wheel.
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
  let aimMode: InputMode = 'hold';
  let leanMode: InputMode = 'hold';
  let scrollSwitchEnabled = true;

  let aimToggled = false;
  let leanToggled: -1 | 0 | 1 = 0;
  let pendingSwitch: WeaponSlot | null = null;
  let pendingZoomToggle = false;
  let activeSlotHint: WeaponSlot = 'primary';
  let lastWheelAt = 0;

  const locked = () => document.pointerLockElement === canvas;
  const down = (code: string) => {
    held.add(code);
    pressed.add(code);
  };
  const active = (code: string) => held.has(code) || pressed.has(code);

  const requestSlot = (slot: WeaponSlot) => {
    pendingSwitch = slot;
    activeSlotHint = slot;
    aimToggled = false;
  };

  document.addEventListener('keydown', (event) => {
    if (!locked()) return;
    if (!event.repeat) {
      down(event.code);
      if (event.code === 'Digit1') requestSlot('primary');
      if (event.code === 'Digit2') requestSlot('secondary');
      if (event.code === 'KeyV') pendingZoomToggle = true;
      if (event.code === 'KeyR') aimToggled = false;
      if (leanMode === 'toggle') {
        if (event.code === 'KeyQ') leanToggled = leanToggled === -1 ? 0 : -1;
        if (event.code === 'KeyE') leanToggled = leanToggled === 1 ? 0 : 1;
      }
    }
    event.preventDefault();
  });
  document.addEventListener('keyup', (event) => held.delete(event.code));
  document.addEventListener('mousedown', (event) => {
    if (!locked()) return;
    if (event.button === 0) down('Fire');
    if (event.button === 2) {
      down('Aim');
      if (aimMode === 'toggle') aimToggled = !aimToggled;
    }
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) held.delete('Fire');
    if (event.button === 2) held.delete('Aim');
  });
  document.addEventListener(
    'wheel',
    (event) => {
      if (!locked() || !scrollSwitchEnabled) return;
      if (Math.abs(event.deltaY) < 4) return;
      const now = performance.now();
      if (now - lastWheelAt < SCROLL_SWITCH_DEBOUNCE_MS) return;
      lastWheelAt = now;
      requestSlot(activeSlotHint === 'primary' ? 'secondary' : 'primary');
    },
    { passive: true },
  );
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
      aimToggled = false;
      leanToggled = 0;
      pendingSwitch = null;
      pendingZoomToggle = false;
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

    setActiveSlot(slot: WeaponSlot) {
      activeSlotHint = slot;
    },

    setSensitivity(hipfire: number, ads: number) {
      mouseMultiplier = hipfire;
      adsMultiplier = ads;
    },

    setControlPreferences(prefs: {
      aimMode: InputMode;
      leanMode: InputMode;
      scrollWeaponSwitch: boolean;
    }) {
      if (prefs.aimMode !== aimMode) aimToggled = false;
      if (prefs.leanMode !== leanMode) leanToggled = 0;
      aimMode = prefs.aimMode;
      leanMode = prefs.leanMode;
      scrollSwitchEnabled = prefs.scrollWeaponSwitch;
    },

    /** Look that has not been handed to the simulation yet. */
    pendingLook: () => ({ yaw, pitch }),

    /** Read and consume input for one simulation step. */
    sample(): GameInput {
      const sprintHeld = active('ShiftLeft');
      if (sprintHeld && active('KeyW')) aimToggled = false;

      const input: GameInput = {
        forward: axis('KeyW', 'KeyS'),
        right: axis('KeyD', 'KeyA'),
        jump: active('Space'),
        sprint: sprintHeld,
        fire: active('Fire'),
        reload: active('KeyR'),
        aim: aimMode === 'toggle' ? aimToggled : active('Aim'),
        toggleZoom: pendingZoomToggle,
        lean: leanMode === 'toggle' ? leanToggled : axis('KeyE', 'KeyQ'),
        switchSlot: pendingSwitch,
        yawDelta: yaw,
        pitchDelta: pitch,
      };
      pressed.clear();
      pendingSwitch = null;
      pendingZoomToggle = false;
      yaw = 0;
      pitch = 0;
      return input;
    },
  };
}
