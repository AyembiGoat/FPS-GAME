export type CrosshairColorId = 'white' | 'brass' | 'cyan' | 'green' | 'red';
export type CrosshairSizeId = 'small' | 'medium' | 'large';

export interface GameSettings {
  readonly mouseSensitivity: number;
  readonly adsSensitivity: number;
  readonly fov: number;
  readonly masterVolume: number;
  readonly crosshairColor: CrosshairColorId;
  readonly crosshairSize: CrosshairSizeId;
  readonly hudScale: number;
  readonly reducedMotion: boolean;
}

export const CROSSHAIR_COLORS: Readonly<
  Record<CrosshairColorId, { readonly label: string; readonly hex: string }>
> = {
  white: { label: 'White', hex: '#F4F7FB' },
  brass: { label: 'Brass', hex: '#F0B449' },
  cyan: { label: 'Cyan', hex: '#53E2F5' },
  green: { label: 'Green', hex: '#5AE88A' },
  red: { label: 'Crimson', hex: '#F25C54' },
};

export const CROSSHAIR_SIZES: Readonly<
  Record<CrosshairSizeId, { readonly label: string; readonly scale: number }>
> = {
  small: { label: 'Small', scale: 0.78 },
  medium: { label: 'Medium', scale: 1 },
  large: { label: 'Large', scale: 1.32 },
};

const STORAGE_KEY = 'fps.settings.v1';

function prefersReducedMotionDefault(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createDefaultSettings(): GameSettings {
  return {
    mouseSensitivity: 1,
    adsSensitivity: 1,
    fov: 78,
    masterVolume: 0.8,
    crosshairColor: 'white',
    crosshairSize: 'medium',
    hudScale: 1,
    reducedMotion: prefersReducedMotionDefault(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(raw: unknown, fallback: number, min: number, max: number, step: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  const rounded = Math.round(raw / step) * step;
  return Number(clamp(rounded, min, max).toFixed(4));
}

function isCrosshairColor(raw: unknown): raw is CrosshairColorId {
  return raw === 'white' || raw === 'brass' || raw === 'cyan' || raw === 'green' || raw === 'red';
}

function isCrosshairSize(raw: unknown): raw is CrosshairSizeId {
  return raw === 'small' || raw === 'medium' || raw === 'large';
}

export function sanitizeSettings(raw: unknown, defaults = createDefaultSettings()): GameSettings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const record = raw as Record<string, unknown>;
  return {
    mouseSensitivity: asNumber(record.mouseSensitivity, defaults.mouseSensitivity, 0.2, 3, 0.05),
    adsSensitivity: asNumber(record.adsSensitivity, defaults.adsSensitivity, 0.25, 2, 0.05),
    fov: asNumber(record.fov, defaults.fov, 65, 105, 1),
    masterVolume: asNumber(record.masterVolume, defaults.masterVolume, 0, 1, 0.05),
    crosshairColor: isCrosshairColor(record.crosshairColor)
      ? record.crosshairColor
      : defaults.crosshairColor,
    crosshairSize: isCrosshairSize(record.crosshairSize)
      ? record.crosshairSize
      : defaults.crosshairSize,
    hudScale: asNumber(record.hudScale, defaults.hudScale, 0.85, 1.2, 0.05),
    reducedMotion:
      typeof record.reducedMotion === 'boolean' ? record.reducedMotion : defaults.reducedMotion,
  };
}

export function createSettingsStore() {
  const defaults = createDefaultSettings();
  let current = defaults;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) current = sanitizeSettings(JSON.parse(saved), defaults);
  } catch {
    current = defaults;
  }

  const listeners = new Set<(settings: GameSettings) => void>();

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Storage may be unavailable in private contexts; live session settings still apply.
    }
  }

  function notify() {
    for (const listener of listeners) listener(current);
  }

  return {
    get: () => current,
    defaults: () => defaults,

    update(patch: Partial<GameSettings>) {
      const next = sanitizeSettings({ ...current, ...patch }, defaults);
      if (
        next.mouseSensitivity === current.mouseSensitivity &&
        next.adsSensitivity === current.adsSensitivity &&
        next.fov === current.fov &&
        next.masterVolume === current.masterVolume &&
        next.crosshairColor === current.crosshairColor &&
        next.crosshairSize === current.crosshairSize &&
        next.hudScale === current.hudScale &&
        next.reducedMotion === current.reducedMotion
      ) {
        return;
      }
      current = next;
      persist();
      notify();
    },

    resetKey(key: keyof GameSettings) {
      this.update({ [key]: defaults[key] });
    },

    resetKeys(keys: readonly (keyof GameSettings)[]) {
      const patch: Partial<Record<keyof GameSettings, GameSettings[keyof GameSettings]>> = {};
      for (const key of keys) patch[key] = defaults[key];
      this.update(patch as Partial<GameSettings>);
    },

    resetAll() {
      this.update(defaults);
    },

    subscribe(listener: (settings: GameSettings) => void): () => void {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
