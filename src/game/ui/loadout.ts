import type { Loadout, WeaponId } from '../../core/weapon';
import { DEFAULT_LOADOUT, getWeaponSpec, isWeaponId } from '../../core/weapon';

const STORAGE_KEY = 'fps.loadout.v1';

export function sanitizeLoadout(raw: unknown): Loadout {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_LOADOUT;
  const record = raw as Record<string, unknown>;
  const primary: WeaponId =
    isWeaponId(record.primary) && getWeaponSpec(record.primary).slot === 'primary'
      ? record.primary
      : DEFAULT_LOADOUT.primary;
  const secondary: WeaponId =
    isWeaponId(record.secondary) && getWeaponSpec(record.secondary).slot === 'secondary'
      ? record.secondary
      : DEFAULT_LOADOUT.secondary;
  return { primary, secondary };
}

export function createLoadoutStore() {
  let current: Loadout = DEFAULT_LOADOUT;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) current = sanitizeLoadout(JSON.parse(saved));
  } catch {
    current = DEFAULT_LOADOUT;
  }

  const listeners = new Set<(loadout: Loadout) => void>();

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Storage may be unavailable; in-session loadout changes still apply immediately.
    }
  }

  function notify() {
    for (const listener of listeners) listener(current);
  }

  return {
    get: () => current,

    equip(weaponId: WeaponId) {
      const spec = getWeaponSpec(weaponId);
      const next: Loadout =
        spec.slot === 'primary'
          ? { ...current, primary: weaponId }
          : { ...current, secondary: weaponId };
      if (next.primary === current.primary && next.secondary === current.secondary) return;
      current = next;
      persist();
      notify();
    },

    set(next: Loadout) {
      const clean = sanitizeLoadout(next);
      if (clean.primary === current.primary && clean.secondary === current.secondary) return;
      current = clean;
      persist();
      notify();
    },

    subscribe(listener: (loadout: Loadout) => void): () => void {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type LoadoutStore = ReturnType<typeof createLoadoutStore>;
