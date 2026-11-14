import './tokens.css';
import './hud.css';
import './menus.css';

import type { GameEvent, GameState } from '../../core/game';
import type { WeaponId } from '../../core/weapon';
import type { GameAudio } from '../audio';
import type { ScopeOverlayState } from '../view';
import { createControlsScreen } from './controlsScreen';
import { el } from './dom';
import { createHudView } from './hudView';
import type { LoadoutStore } from './loadout';
import { createLoadoutScreen } from './loadoutScreen';
import { createIntroScreen, createPauseScreen, createTitleScreen } from './menuScreens';
import type { SettingsStore } from './settings';
import { CROSSHAIR_COLORS, CROSSHAIR_SIZES } from './settings';
import { createSettingsScreen } from './settingsScreen';

export type ScreenName = 'playing' | 'title' | 'pause' | 'loadout' | 'settings' | 'controls';

export interface GameUiOptions {
  readonly mode: 'auto' | 'bot' | 'play';
  readonly totalTargets: number;
  readonly audio: GameAudio;
  readonly settings: SettingsStore;
  readonly loadout: LoadoutStore;
  readonly onRequestPlay: (deployWeaponId?: WeaponId) => void;
  readonly onRestartRun: () => void;
  readonly onQuitToTitle: () => void;
}

export function createGameUi(options: GameUiOptions) {
  const { mode, totalTargets, audio, settings, loadout } = options;

  const root = el('div', 'ui-root');
  document.body.append(root);

  const backdrop = el('div', 'menu-backdrop');
  backdrop.dataset.mode = 'none';
  root.append(backdrop);

  const hud = createHudView(root, totalTargets);

  let currentScreen: ScreenName = mode === 'play' ? 'title' : 'playing';
  let returnScreen: 'title' | 'pause' = 'title';
  let sessionStarted = mode !== 'play';

  const titleScreen = createTitleScreen(root, audio, {
    onPlay: () => {
      sessionStarted = true;
      setScreen('playing');
      options.onRequestPlay();
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
    introHandle = createIntroScreen(root, () => {
      introHandle = null;
      if (currentScreen === 'title') {
        backdrop.dataset.mode = 'title';
        titleScreen.setActive(true);
      }
    });
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
      const totalDown = state.targetsDown.filter(Boolean).length;
      const fallenEvents = events.filter((e) => e.type === 'target-down');
      let runningDown = totalDown - fallenEvents.length;

      for (const event of events) {
        switch (event.type) {
          case 'shot':
            hud.onShot(event.hit !== null && event.hit.surface !== 'target');
            break;
          case 'target-down':
            runningDown++;
            hud.onTargetDown(event.distance, runningDown);
            if (runningDown === totalTargets) {
              audio.uiConfirm();
            }
            break;
          case 'dry-fire':
            hud.onDryFire();
            break;
          case 'targets-reset':
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
