import type { GameEvent, GameInput, GameState } from '../core/game';
import type { Loadout, WeaponId, WeaponSlot } from '../core/weapon';
import type { ScreenName } from './ui';
import type { GameSettings } from './ui/settings';

declare global {
  interface Window {
    /** Present only when the page is opened with `?auto`. See scripts/playtest.mjs. */
    __fps?: {
      state(): GameState;
      /** Hold `input` for `steps` simulation steps (60 per second). */
      step(input?: Partial<GameInput>, steps?: number): GameEvent[];
      /** Let the bot play for `steps` simulation steps. */
      bot(steps?: number): GameEvent[];
      /** Current magnification of the view. 1 is not zoomed. */
      zoom(): number;
      /** Peak loudness of each sound as a fraction of the gunshot. */
      loudness(): Promise<Record<string, number>>;
      /** Open a UI screen directly for automated verification and screenshot capture. */
      openScreen(screen: ScreenName): void;
      /** Current active UI screen. */
      screen(): ScreenName;
      /** Read or update persisted game settings. */
      settings(patch?: Partial<GameSettings>): GameSettings;
      /** Equip a weapon directly in live state and loadout storage, optionally switching to its slot. */
      equipWeapon(weaponId: WeaponId, activeSlot?: WeaponSlot): GameState;
      /** Read current persisted loadout. */
      loadout(): Loadout;
      /** Select a specific firearm on the Armory Loadout screen. */
      inspectLoadout(weaponId: WeaponId): void;
      /** Switch Settings screen tab directly. */
      selectSettingsTab(tab: 'controls' | 'gameplay' | 'audio' | 'interface'): void;
      /** Teleport player to a specific position/yaw for reproducible visual verification. */
      place(position: { x: number; y: number; z: number }, yaw: number, pitch?: number): void;
      /** Reset the current run back to spawn. */
      restart(): void;
    };
  }
}
