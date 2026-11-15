import './tokens.css';
import './hud.css';
import './menus.css';

import type { GameEvent, GameState } from '../../core/game';
import type { MapId } from '../../core/map';
import type { GameModeId } from '../../core/modes';
import type { WeaponId } from '../../core/weapon';
import type { GameAudio } from '../audio';
import type { ScopeOverlayState } from '../view';
import { createControlsScreen } from './controlsScreen';
import { el } from './dom';
import { createHudView } from './hudView';
import type { LoadoutStore } from './loadout';
import { createLoadoutScreen } from './loadoutScreen';
import { createIntroScreen, createPauseScreen, createTitleScreen } from './menuScreens';
import { createModesScreen } from './modesScreen';
import type { ModeStore } from './modeStore';
import type { SettingsStore } from './settings';
import { CROSSHAIR_COLORS, CROSSHAIR_SIZES } from './settings';
import { createSettingsScreen } from './settingsScreen';

export type ScreenName =
  'playing' | 'title' | 'pause' | 'modes' | 'loadout' | 'settings' | 'controls';

export interface GameUiOptions {
  readonly mode: 'auto' | 'bot' | 'play';
  readonly totalTargets: number;
  readonly audio: GameAudio;
  readonly settings: SettingsStore;
  readonly loadout: LoadoutStore;
  readonly modeStore: ModeStore;
  readonly onRequestPlay: (deployWeaponId?: WeaponId) => void;
  readonly onSelectOperation: (modeId: GameModeId, mapId: MapId, deployNow: boolean) => void;
  readonly onRestartRun: () => void;
  readonly onQuitToTitle: () => void;
}

export function createGameUi(options: GameUiOptions) {
  const { mode, totalTargets, audio, settings, loadout, modeStore } = options;

  const root = el('div', 'ui-root');
  document.body.append(root);

  const backdrop = el('div', 'menu-backdrop');
  backdrop.dataset.mode = 'none';
  root.append(backdrop);

  const hud = createHudView(root, totalTargets, {
    onRestartRun: () => {
      audio.uiConfirm();
      hud.clearFeed();
      options.onRestartRun();
      setScreen('playing');
      options.onRequestPlay();
    },
    onQuitToTitle: () => {
      audio.uiBack();
      sessionStarted = false;
      hud.clearFeed();
      options.onQuitToTitle();
      setScreen('title');
    },
  });

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

  const modesScreen = createModesScreen(root, modeStore, audio, {
    onBack: () => {
      setScreen(returnScreen);
    },
    onDeploy: (modeId: GameModeId, mapId: MapId) => {
      sessionStarted = true;
      hud.clearFeed();
      options.onSelectOperation(modeId, mapId, true);
      setScreen('playing');
      options.onRequestPlay();
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
    modesScreen.setActive(currentScreen === 'modes');
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

  modeStore.subscribe((sel) => {
    titleScreen.syncOperation(sel.mode, sel.mapId);
    pauseScreen.syncOperation(sel.mode, sel.mapId);
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
      root.dataset.instant = 'true';
      hud.clearFeed();
      requestAnimationFrame(() => {
        delete root.dataset.instant;
      });
    },

    openScreen(next: ScreenName, latestState?: GameState) {
      root.dataset.instant = 'true';
      introHandle?.skip();
      if (next === 'playing') sessionStarted = true;
      if (next === 'title') sessionStarted = false;
      if (next === 'pause' && latestState) pauseScreen.syncTelemetry(latestState);
      if (next === 'modes' || next === 'loadout' || next === 'settings' || next === 'controls') {
        returnScreen = sessionStarted ? 'pause' : 'title';
      }
      setScreen(next);
      root.getBoundingClientRect();
      delete root.dataset.instant;
    },

    inspectMode(modeId: GameModeId, mapId?: MapId) {
      modesScreen.inspect(modeId, mapId);
    },

    inspectMap(mapId: MapId) {
      modesScreen.inspectMap(mapId);
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
      } else if (
        sessionStarted &&
        currentScreen === 'playing' &&
        latestState.outcome === 'ongoing'
      ) {
        pauseScreen.syncTelemetry(latestState);
        setScreen('pause');
      }
    },

    handleEvents(events: readonly GameEvent[], state: GameState) {
      const totalDown = state.targetsDown.filter(Boolean).length;
      const fallenEvents = events.filter((e) => e.type === 'target-down');
      let runningDown = totalDown - fallenEvents.length;

      const enemyDownEvents = events.filter((e) => e.type === 'enemy-down');
      let runningEnemiesDown = state.run.enemiesDown - enemyDownEvents.length;

      for (const event of events) {
        switch (event.type) {
          case 'shot':
            hud.onShot(
              event.hit !== null && event.hit.surface !== 'target' && event.hit.surface !== 'enemy',
            );
            break;
          case 'target-down':
            runningDown++;
            hud.onTargetDown(event.distance, runningDown, state.targetsDown.length);
            if (runningDown === state.targetsDown.length) {
              audio.uiConfirm();
            }
            break;
          case 'enemy-hit':
            hud.onEnemyHit(event.zone === 'head');
            break;
          case 'enemy-down':
            runningEnemiesDown++;
            hud.onEnemyDown(
              event.distance,
              runningEnemiesDown,
              state.enemies.length,
              event.headshot,
            );
            break;
          case 'gun-game-advance':
            hud.onTierAdvance(event.tierIndex, event.totalTiers, event.weaponId);
            break;
          case 'player-hit':
            hud.onPlayerHit(event.fromDirection);
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
