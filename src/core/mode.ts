/**
 * The selectable game modes. This is the whole list: if a mode is shown in the menu it is
 * here, and every mode names the map content it actually uses.
 */

export type GameModeId = 'firefight' | 'steel';

export interface GameModeSpec {
  readonly id: GameModeId;
  readonly name: string;
  /** One line for the menu card. */
  readonly description: string;
  /** What the player has to do to finish the run. */
  readonly objective: string;
  /** Enemy combatants take part. */
  readonly enemies: boolean;
  /** Steel plates take part. */
  readonly targets: boolean;
}

export const FIREFIGHT: GameModeSpec = {
  id: 'firefight',
  name: 'Firefight',
  description: 'Hostile combatants hold the compound. Flank, use cover, and clear them all.',
  objective: 'Neutralize every hostile',
  enemies: true,
  targets: false,
};

export const STEEL: GameModeSpec = {
  id: 'steel',
  name: 'Steel Targets',
  description: 'Steel plates only. Shoot them down from the yard, the house and the long lane.',
  objective: 'Knock down every steel plate',
  enemies: false,
  targets: true,
};

export const GAME_MODES: readonly GameModeSpec[] = [FIREFIGHT, STEEL];

export const DEFAULT_MODE: GameModeId = 'firefight';

export function isGameModeId(value: unknown): value is GameModeId {
  return value === 'firefight' || value === 'steel';
}

export function gameMode(id: GameModeId): GameModeSpec {
  return id === 'steel' ? STEEL : FIREFIGHT;
}
