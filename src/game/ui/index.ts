import './tokens.css';
import './hud.css';
import './menus.css';

import type { GameEvent, GameState } from '../../core/game';
import type { GameModeId, GameModeSpec } from '../../core/mode';
import type { WeaponId } from '../../core/weapon';
import type { GameAudio } from '../audio';
import type { ScopeOverlayState } from '../view';
import { createControlsScreen } from './controlsScreen';
import { el } from './dom';
import { createHudView } from './hudView';
import type { LoadoutStore } from './loadout';
import { createLoadoutScreen } from './loadoutScreen';
import {
  createIntroScreen,
  createModesScreen,
  createPauseScreen,
  createTitleScreen,
} from './menuScreens';
import type { SettingsStore } from './settings';
import { CROSSHAIR_COLORS, CROSSHAIR_SIZES } from './settings';
import { createSettingsScreen } from './settingsScreen';

export type ScreenName =
  'playing' | 'title' | 'modes' | 'pause' | 'loadout' | 'settings' | 'controls';

export interface GameUiOptions {
  readonly mode: 'auto' | 'bot' | 'play';
  /** How many of each thing the map actually has, for the mode cards. */
  readonly counts: { readonly hostiles: number; readonly plates: number };
  readonly audio: GameAudio;
  readonly settings: SettingsStore;
  readonly loadout: LoadoutStore;
  readonly onRequestPlay: (deployWeaponId?: WeaponId) => void;
  readonly onRestartRun: () => void;
  readonly onQuitToTitle: () => void;
  /** Start the chosen mode from scratch. */
  readonly onDeployMode: (mode: GameModeId) => void;
  readonly currentMode: () => GameModeSpec;
}

export function createGameUi(options: GameUiOptions) {
  const { mode, audio, settings, loadout } = options;

  const root = el('div', 'ui-root');
  document.body.append(root);

  const backdrop = el('div', 'menu-backdrop');
  backdrop.dataset.mode = 'none';
  root.append(backdrop);

  const hud = createHudView(root);

  let currentScreen: ScreenName = mode === 'play' ? 'title' : 'playing';
  let returnScreen: 'title' | 'pause' = 'title';
  let sessionStarted = mode !== 'play';

  const titleScreen = createTitleScreen(root, audio, {
    onPlay: () => {
      sessionStarted = true;
      setScreen('playing');
      options.onRequestPlay();
    },
    onModes: () => {
      returnScreen = 'title';
      setScreen('modes');
    },
    onLoadout: () => {
      returnScreen = 'title';
      setScreen('loadout');
    },
    onSettings: () => {
      returnScreen = 'title';
      setScreen('settings');
    },
    onControls: () => {
      returnScreen = 'title';
      setScreen('controls');
    },
  });

  const pauseScreen = createPauseScreen(root, audio, {
    onResume: () => {
      setScreen('playing');
      options.onRequestPlay();
    },
    onModes: () => {
      returnScreen = 'pause';
      setScreen('modes');
    },
    onLoadout: () => {
      returnScreen = 'pause';
      setScreen('loadout');
    },
    onRestart: () => {
      hud.clearFeed();
      options.onRestartRun();
      setScreen('playing');
      options.onRequestPlay();
    },
    onSettings: () => {
      returnScreen = 'pause';
      setScreen('settings');
    },
    onControls: () => {
      returnScreen = 'pause';
      setScreen('controls');
    },
    onQuitToTitle: () => {
      sessionStarted = false;
      hud.clearFeed();
      options.onQuitToTitle();
      setScreen('title');
    },
  });

  const modesScreen = createModesScreen(
    root,
    audio,
    {
      onDeploy: (modeId) => {
        sessionStarted = true;
        hud.clearFeed();
        options.onDeployMode(modeId);
        setScreen('playing');
      },
      onBack: () => {
        setScreen(returnScreen);
      },
    },
    options.counts,
  );

  const loadoutScreen = createLoadoutScreen(root, loadout, audio, {
    onBack: () => {
      setScreen(returnScreen);
    },
    onDeploy: (weaponId) => {
      sessionStarted = true;
      setScreen('playing');
      options.onRequestPlay(weaponId);
    },
  });

  const settingsScreen = createSettingsScreen(root, settings, audio, () => {
    setScreen(returnScreen);
  });

  const controlsScreen = createControlsScreen(root, audio, () => {
    setScreen(returnScreen);
  });

  function applyScreenStates() {
    titleScreen.setActive(currentScreen === 'title');
    modesScreen.setActive(currentScreen === 'modes');
    pauseScreen.setActive(currentScreen === 'pause');
    loadoutScreen.setActive(currentScreen === 'loadout');
    settingsScreen.setActive(currentScreen === 'settings');
    controlsScreen.setActive(currentScreen === 'controls');

    if (currentScreen === 'playing') {
      backdrop.dataset.mode = 'none';
    } else if (currentScreen === 'title') {
      backdrop.dataset.mode = 'title';
    } else {
      backdrop.dataset.mode = 'modal';
    }
  }

  function setScreen(next: ScreenName) {
    currentScreen = next;
    applyScreenStates();
  }

  loadout.subscribe((current) => {
    titleScreen.syncLoadout(current);
    pauseScreen.syncLoadout(current);
  });
  titleScreen.syncMode(options.currentMode());

  settings.subscribe((current) => {
    root.dataset.reducedMotion = current.reducedMotion ? 'true' : 'false';
    document.documentElement.style.setProperty('--ui-hud-scale', String(current.hudScale));
    document.documentElement.style.setProperty(
      '--ui-crosshair-color',
      CROSSHAIR_COLORS[current.crosshairColor].hex,
    );
    document.documentElement.style.setProperty(
      '--ui-crosshair-scale',
      String(CROSSHAIR_SIZES[current.crosshairSize].scale),
    );
    audio.setVolume(current.masterVolume);
    audio.setUiCuesEnabled(current.uiAudioCues);
  });

  let introHandle: { skip: () => void } | null = null;
  if (mode === 'play') {
    titleScreen.setActive(false);
    backdrop.dataset.mode = 'intro';
    introHandle = createIntroScreen(
      root,
      () => {
        introHandle = null;
        if (currentScreen === 'title') {
          backdrop.dataset.mode = 'title';
          titleScreen.setActive(true);
        }
      },
      options.counts,
    );
  } else {
    applyScreenStates();
  }

  return {
    screen: () => currentScreen,
    isTitleBackdropActive: () => !sessionStarted,

    resetRunUi() {
      hud.clearFeed();
    },

    openScreen(next: ScreenName, latestState?: GameState) {
      introHandle?.skip();
      if (next === 'playing') sessionStarted = true;
      if (next === 'title') sessionStarted = false;
      if (next === 'pause' && latestState) pauseScreen.syncTelemetry(latestState);
      if (next === 'title') titleScreen.syncMode(options.currentMode());
      if (next === 'loadout' || next === 'settings' || next === 'controls') {
        returnScreen = sessionStarted ? 'pause' : 'title';
      }
      setScreen(next);
    },

    inspectLoadoutWeapon(weaponId: WeaponId) {
      loadoutScreen.inspect(weaponId);
    },

    selectSettingsTab(tab: 'controls' | 'gameplay' | 'audio' | 'interface') {
      settingsScreen.selectTab(tab);
    },

    onPointerLockChanged(locked: boolean, latestState: GameState) {
      if (mode !== 'play') return;
      if (locked) {
        introHandle?.skip();
        sessionStarted = true;
        setScreen('playing');
      } else if (sessionStarted && currentScreen === 'playing') {
        pauseScreen.syncTelemetry(latestState);
        setScreen('pause');
      }
    },

    handleEvents(events: readonly GameEvent[], state: GameState) {
      const hostiles = state.mode === 'firefight';
      const total = hostiles ? state.enemies.length : state.targetsDown.length;
      const done = hostiles
        ? state.enemies.filter((enemy) => enemy.behavior === 'dead').length
        : state.targetsDown.filter(Boolean).length;
      const fresh = events.filter(
        (event) => event.type === 'target-down' || event.type === 'enemy-killed',
      ).length;
      let running = done - fresh;

      for (const event of events) {
        switch (event.type) {
          case 'shot':
            hud.onShot(event.hit !== null && event.hit.surface !== 'target');
            break;
          case 'target-down':
            running++;
            hud.onObjectiveDown(event.distance, running, total, 'target');
            if (running === total) audio.uiConfirm();
            break;
          case 'enemy-killed':
            running++;
            hud.onObjectiveDown(event.distance, running, total, 'hostile');
            if (running === total) audio.uiConfirm();
            break;
          case 'player-damaged':
            hud.onDamage();
            break;
          case 'dry-fire':
            hud.onDryFire();
            break;
          case 'run-reset':
            hud.clearFeed();
            break;
          default:
            break;
        }
      }
    },

    update(dt: number, state: GameState, aimBlend: number, scopeOverlay: ScopeOverlayState) {
      if (currentScreen === 'pause') {
        pauseScreen.syncTelemetry(state);
      }
      const s = settings.get();
      hud.update(dt, {
        state,
        aimBlend,
        scopeOverlay,
        visible: currentScreen === 'playing',
        reducedMotion: s.reducedMotion,
        showTacticalFeed: s.showTacticalFeed,
      });
    },
  };
}

export type GameUi = ReturnType<typeof createGameUi>;
