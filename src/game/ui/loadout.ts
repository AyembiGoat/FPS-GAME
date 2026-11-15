import type { AttachmentId, AttachmentSlot, WeaponAttachments } from '../../core/attachments';
import { NO_ATTACHMENTS, sanitizeAttachments } from '../../core/attachments';
import type { Loadout, OpticId, WeaponId } from '../../core/weapon';
import {
  clampWeaponOptic,
  DEFAULT_LOADOUT,
  getWeaponSpec,
  isOpticId,
  isWeaponId,
} from '../../core/weapon';

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

  const optics: Partial<Record<WeaponId, OpticId>> = {};
  if (typeof record.optics === 'object' && record.optics !== null) {
    for (const [k, v] of Object.entries(record.optics as Record<string, unknown>)) {
      if (isWeaponId(k) && isOpticId(v)) {
        optics[k] = clampWeaponOptic(k, v);
      }
    }
  }

  // Saved parts are checked against the gun again: a part that no longer fits is dropped.
  const attachments: Partial<Record<WeaponId, WeaponAttachments>> = {};
  if (typeof record.attachments === 'object' && record.attachments !== null) {
    for (const [k, v] of Object.entries(record.attachments as Record<string, unknown>)) {
      if (!isWeaponId(k)) continue;
      const fitted = sanitizeAttachments(getWeaponSpec(k), v);
      if (Object.keys(fitted).length > 0) attachments[k] = fitted;
    }
  }
  return { primary, secondary, optics, attachments };
}

function attachmentsEqual(a: Loadout['attachments'], b: Loadout['attachments']): boolean {
  return JSON.stringify(sortedAttachments(a)) === JSON.stringify(sortedAttachments(b));
}

function sortedAttachments(value: Loadout['attachments']) {
  return Object.entries(value ?? {})
    .map(([weaponId, parts]) => [weaponId, Object.entries(parts).sort()] as const)
    .filter(([, parts]) => parts.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function opticsEqual(
  a?: Readonly<Partial<Record<WeaponId, OpticId>>>,
  b?: Readonly<Partial<Record<WeaponId, OpticId>>>,
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (
      (a as Record<string, unknown> | undefined)?.[k] !==
      (b as Record<string, unknown> | undefined)?.[k]
    ) {
      return false;
    }
  }
  return true;
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

    opticFor(weaponId: WeaponId): OpticId {
      return clampWeaponOptic(weaponId, current.optics?.[weaponId]);
    },

    attachmentsFor(weaponId: WeaponId): WeaponAttachments {
      return current.attachments?.[weaponId] ?? NO_ATTACHMENTS;
    },

    /** Fit `attachmentId` in `slot` of `weaponId`, or empty the slot with `null`. */
    setAttachment(weaponId: WeaponId, slot: AttachmentSlot, attachmentId: AttachmentId | null) {
      const before = current.attachments?.[weaponId] ?? NO_ATTACHMENTS;
      const wanted: Partial<Record<AttachmentSlot, AttachmentId | null>> = {
        ...before,
        [slot]: attachmentId,
      };
      const fitted = sanitizeAttachments(getWeaponSpec(weaponId), wanted);
      if (before[slot] === fitted[slot]) return;
      current = {
        ...current,
        attachments: { ...(current.attachments ?? {}), [weaponId]: fitted },
      };
      persist();
      notify();
    },

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

    setOptic(weaponId: WeaponId, opticId: OpticId) {
      const resolved = clampWeaponOptic(weaponId, opticId);
      if (clampWeaponOptic(weaponId, current.optics?.[weaponId]) === resolved) return;
      current = {
        ...current,
        optics: { ...(current.optics ?? {}), [weaponId]: resolved },
      };
      persist();
      notify();
    },

    set(next: Loadout) {
      const clean = sanitizeLoadout(next);
      if (
        clean.primary === current.primary &&
        clean.secondary === current.secondary &&
        opticsEqual(clean.optics, current.optics) &&
        attachmentsEqual(clean.attachments, current.attachments)
      ) {
        return;
      }
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
