import type { AttachmentId, AttachmentSlot } from '../core/attachments';
import type { GameEvent, GameInput, GameState } from '../core/game';
import type { MapId } from '../core/map';
import type { GameModeId } from '../core/modes';
import type { Loadout, OpticId, WeaponId, WeaponSlot } from '../core/weapon';
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
      /** Read or switch the active single-player game mode, resetting the match when changed. */
      mode(nextMode?: GameModeId): GameModeId;
      /** Read or switch the active arena map (`shoot-house` or `cargo-yard`), rebuilding the world cleanly. */
      map(nextMap?: MapId): MapId;
      /** Select a specific game mode (and optional map) on the Game Modes & Maps screen. */
      inspectMode(modeId: GameModeId, mapId?: MapId): void;
      /** Select a specific arena map card on the Game Modes & Maps screen. */
      inspectMap(mapId: MapId): void;
      /** Read or update persisted game settings. */
      settings(patch?: Partial<GameSettings>): GameSettings;
      /** Equip a weapon directly in live state and loadout storage, optionally switching to its slot. */
      equipWeapon(weaponId: WeaponId, activeSlot?: WeaponSlot): GameState;
      /** Mount a specific optic on a firearm and refresh live weapon state. */
      setOptic(weaponId: WeaponId, opticId: OpticId): GameState;
      /** Fit a part in one slot of a firearm (`null` empties the slot) and refresh live weapon state. */
      setAttachment(
        weaponId: WeaponId,
        slot: AttachmentSlot,
        attachmentId: AttachmentId | null,
      ): GameState;
      /** Set the player's health or boost meter directly, for reproducible HUD screenshots. */
      setVitals(patch: { health?: number; boost?: number }): GameState;
      /** Read current WebGL draw-call / triangle / DPR telemetry. */
      renderStats(): { calls: number; triangles: number; geometries: number; pixelRatio: number };
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
