import type { WeaponId } from './weapon';

/**
 * Selectable single-player game modes (`gungame` and `practice`) and AI fairness tuning.
 * All modes run 100% locally in the pure deterministic core simulation.
 */

export type GameModeId = 'gungame' | 'practice';

/**
 * 8-tier Gun Game weapon progression chain:
 * Every confirmed hostile elimination advances the player one tier up the chain,
 * immediately equipping and chambering the next firearm through all 8 arsenal weapons.
 */
export const GUN_GAME_LADDER: readonly WeaponId[] = [
  'm1911',
  'mp5',
  'remington-870',
  'hk416',
  'ak47',
  'scar-h',
  'awm',
  'desert-eagle',
] as const;

export interface DifficultyTuning {
  /** Maximum sight distance in metres before LOS fails. */
  readonly visionRange: number;
  /** Horizontal/3D field of view in degrees while unalerted. */
  readonly visionFovDeg: number;
  /** Close-range peripheral awareness distance in metres regardless of facing. */
  readonly peripheralRange: number;
  /** Distance in metres within which unsuppressed player gunfire alerts nearby enemies. */
  readonly gunshotAlertRange: number;
  /** Seconds an enemy must perceive the player before firing its first burst. */
  readonly reactionTime: number;
  /** Maximum angular turn rate in radians per second (finite, never instant snap). */
  readonly turnSpeed: number;
  /** Angular cone half-angle (radians) of enemy weapon aim spread when stationary. */
  readonly aimSpreadRad: number;
  /** Multiplier applied to enemy weapon spread when moving/strafing. */
  readonly movingSpreadFactor: number;
  /** Multiplier applied to base firearm damage when an enemy hits the player. */
  readonly enemyDamageScale: number;
  /** Minimum & maximum rounds fired per enemy burst before pausing. */
  readonly burstMin: number;
  readonly burstMax: number;
  /** Minimum & maximum seconds between bursts so enemies fire controlled volleys. */
  readonly burstCooldownMin: number;
  readonly burstCooldownMax: number;
  /** Seconds an enemy remembers the player's last known position after losing LOS. */
  readonly memoryDuration: number;
  /** Enemy walking/repositioning speed in metres per second. */
  readonly moveSpeed: number;
}

export interface GameModeSpec {
  readonly id: GameModeId;
  readonly name: string;
  readonly shortName: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly threatLabel: string;
  readonly objectiveLabel: string;
  readonly usesEnemies: boolean;
  readonly usesWeaponLadder: boolean;
  readonly enemyLimit: number;
  readonly playerMaxHealth: number;
  readonly autoResetOnClear: boolean;
  readonly tuning: DifficultyTuning;
}

export const STANDARD_COMBAT_TUNING: DifficultyTuning = {
  visionRange: 50,
  visionFovDeg: 135,
  peripheralRange: 5.5,
  gunshotAlertRange: 28,
  reactionTime: 0.42,
  turnSpeed: 4.2,
  aimSpreadRad: 0.048,
  movingSpreadFactor: 1.45,
  enemyDamageScale: 0.28,
  burstMin: 2,
  burstMax: 4,
  burstCooldownMin: 0.6,
  burstCooldownMax: 0.98,
  memoryDuration: 5.5,
  moveSpeed: 3.9,
};

export const GAME_MODES: Readonly<Record<GameModeId, GameModeSpec>> = {
  gungame: {
    id: 'gungame',
    name: 'Gun Game',
    shortName: 'Gun Game',
    subtitle: '8-TIER WEAPON ESCALATION · LIVE COMBAT',
    summary:
      'Start with the M1911 and advance through all eight firearms — every hostile elimination immediately equips the next weapon up the chain until the final Desert Eagle kill.',
    threatLabel: 'ESCALATION COMBAT',
    objectiveLabel: 'TIER',
    usesEnemies: true,
    usesWeaponLadder: true,
    enemyLimit: 10,
    playerMaxHealth: 100,
    autoResetOnClear: false,
    tuning: STANDARD_COMBAT_TUNING,
  },
  practice: {
    id: 'practice',
    name: 'Practice',
    shortName: 'Practice',
    subtitle: 'FREE LOADOUT & OPTICS · 16 STEEL TARGETS',
    summary:
      'Unopposed live-fire practice across the full map with unrestricted Loadout & Armory switching, variable-zoom optics, timed accuracy telemetry, and automatic target resets.',
    threatLabel: 'LIVE-FIRE TRAINING',
    objectiveLabel: 'TARGETS',
    usesEnemies: false,
    usesWeaponLadder: false,
    enemyLimit: 0,
    playerMaxHealth: 100,
    autoResetOnClear: true,
    tuning: STANDARD_COMBAT_TUNING,
  },
};

export const GAME_MODE_LIST: readonly GameModeSpec[] = [GAME_MODES.gungame, GAME_MODES.practice];

export const DEFAULT_GAME_MODE: GameModeId = 'gungame';

export function isGameModeId(value: string | null | undefined): value is GameModeId {
  return value === 'gungame' || value === 'practice';
}

export function getGameModeSpec(id: GameModeId): GameModeSpec {
  return GAME_MODES[id];
}
