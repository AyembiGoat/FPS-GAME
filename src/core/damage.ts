/**
 * Shared damage model: hit zones, body armour and helmets.
 *
 * Pure data and functions. The same rules apply to the player, to AI combatants and to
 * damageable practice dummies, so later modes reuse them without a second code path.
 * Every number here is game balance, not a published real-world figure.
 */

export type HitZone = 'head' | 'torso' | 'legs';
export type ArmourLevel = 0 | 1 | 2 | 3;
export type ArmourPiece = 'vest' | 'helmet';

export interface ArmourState {
  readonly vest: ArmourLevel;
  /** Durability points left in the vest; 0 when no vest is worn. */
  readonly vestDurability: number;
  readonly helmet: ArmourLevel;
  /** Durability points left in the helmet; 0 when no helmet is worn. */
  readonly helmetDurability: number;
}

export const ARMOUR_TUNING = {
  /** Share of incoming damage a piece soaks up, indexed by level (0 = nothing worn). */
  absorb: [0, 0.3, 0.4, 0.55],
  /** Vest durability pool by level. Vests protect the torso only. */
  vestDurability: [0, 200, 220, 250],
  /** Helmet durability pool by level. Helmets protect the head only. */
  helmetDurability: [0, 80, 150, 230],
  /** Limb hits carry this share of torso damage and are never armoured. */
  legsDamageScale: 0.85,
} as const;

export const NO_ARMOUR: ArmourState = {
  vest: 0,
  vestDurability: 0,
  helmet: 0,
  helmetDurability: 0,
};

export function clampArmourLevel(value: number): ArmourLevel {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  if (value >= 1) return 1;
  return 0;
}

/** Fresh, undamaged armour at the given levels. */
export function createArmour(vest: number = 0, helmet: number = 0): ArmourState {
  const vestLevel = clampArmourLevel(vest);
  const helmetLevel = clampArmourLevel(helmet);
  return {
    vest: vestLevel,
    vestDurability: ARMOUR_TUNING.vestDurability[vestLevel],
    helmet: helmetLevel,
    helmetDurability: ARMOUR_TUNING.helmetDurability[helmetLevel],
  };
}

export function armourMaxDurability(piece: ArmourPiece, level: ArmourLevel): number {
  return piece === 'vest'
    ? ARMOUR_TUNING.vestDurability[level]
    : ARMOUR_TUNING.helmetDurability[level];
}

/** Which piece of armour covers a hit zone, if any. */
export function armourPieceForZone(zone: HitZone): ArmourPiece | null {
  if (zone === 'torso') return 'vest';
  if (zone === 'head') return 'helmet';
  return null;
}

export interface ArmourResult {
  readonly armour: ArmourState;
  /** Damage that reaches health after the armour has taken its share. */
  readonly healthDamage: number;
  /** Damage the armour soaked up. */
  readonly absorbed: number;
  /** The piece that was struck, or `null` when the zone was unprotected. */
  readonly piece: ArmourPiece | null;
  /** The piece this hit destroyed, or `null`. */
  readonly broken: ArmourPiece | null;
}

/**
 * Pass one hit through whatever armour covers `zone`.
 *
 * The piece absorbs `absorb[level] × (1 − armourPiercing)` of the hit and loses durability equal
 * to the full incoming damage. A hit larger than the durability left is only protected for the
 * share the remaining durability covers; the piece then breaks and stops protecting.
 */
export function applyArmour(
  armour: ArmourState,
  rawDamage: number,
  zone: HitZone,
  armourPiercing: number,
): ArmourResult {
  const piece = armourPieceForZone(zone);
  if (piece === null || rawDamage <= 0) {
    return { armour, healthDamage: Math.max(0, rawDamage), absorbed: 0, piece: null, broken: null };
  }
  const level = piece === 'vest' ? armour.vest : armour.helmet;
  const durability = piece === 'vest' ? armour.vestDurability : armour.helmetDurability;
  if (level === 0 || durability <= 0) {
    return { armour, healthDamage: rawDamage, absorbed: 0, piece: null, broken: null };
  }

  const piercing = Math.min(1, Math.max(0, armourPiercing));
  const coveredShare = Math.min(1, durability / rawDamage);
  const absorbed = rawDamage * coveredShare * ARMOUR_TUNING.absorb[level] * (1 - piercing);
  const remaining = Math.max(0, durability - rawDamage);
  const broken = remaining === 0;

  const nextArmour: ArmourState =
    piece === 'vest'
      ? { ...armour, vest: broken ? 0 : armour.vest, vestDurability: remaining }
      : { ...armour, helmet: broken ? 0 : armour.helmet, helmetDurability: remaining };

  return {
    armour: nextArmour,
    healthDamage: rawDamage - absorbed,
    absorbed,
    piece,
    broken: broken ? piece : null,
  };
}

/** Anything with health and armour that the damage model can hurt. */
export interface Vitals {
  readonly health: number;
  readonly maxHealth: number;
  readonly armour: ArmourState;
}

export interface DamageResult extends ArmourResult {
  readonly health: number;
  /** Health actually removed (never more than the target had). */
  readonly healthLost: number;
  readonly killed: boolean;
}

/** Apply one hit to a target's armour and health. */
export function applyDamage(
  target: Vitals,
  rawDamage: number,
  zone: HitZone,
  armourPiercing: number,
): DamageResult {
  const through = applyArmour(target.armour, rawDamage, zone, armourPiercing);
  const healthLost = Math.min(target.health, through.healthDamage);
  const health = Math.max(0, target.health - healthLost);
  return { ...through, health, healthLost, killed: target.health > 0 && health === 0 };
}
