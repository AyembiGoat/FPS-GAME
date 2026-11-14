import type { GameEvent, GameInput, GameState } from '../core/game';

declare global {
  interface Window {
    /** Present only when the page is opened with `?auto`. See scripts/playtest.mjs. */
    __fps?: {
      state(): GameState;
      /** Hold `input` for `steps` simulation steps (60 per second). */
      step(input?: Partial<GameInput>, steps?: number): GameEvent[];
      /** Let the bot play for `steps` simulation steps. */
      bot(steps?: number): GameEvent[];
    };
  }
}
