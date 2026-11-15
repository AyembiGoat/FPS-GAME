import { createBot } from '../core/bot';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, setGameLoadout, stepGame } from '../core/game';
import type { GameMap, MapId } from '../core/map';
import { getMapById, isMapId } from '../core/maps';
import type { GameModeId } from '../core/modes';
import { isGameModeId } from '../core/modes';
import { NO_INPUT } from '../core/player';
import type { OpticId, WeaponId, WeaponSlot } from '../core/weapon';
import { getWeaponSpec, isOpticId, isWeaponId } from '../core/weapon';
import { createAudio, measureSounds } from './audio';
import { createHumanInput } from './input';
import { showMaterials } from './materials/preview';
import { createGameUi } from './ui';
import { createLoadoutStore } from './ui/loadout';
import { createModeStore } from './ui/modeStore';
import { createSettingsStore } from './ui/settings';
import { createView } from './view';
import { showWeapon } from './weapons/preview';

/**
 * Ways to run:
 *   (default)       a person plays with keyboard and mouse from the live Title Screen.
 *   ?bot            the bot plays in real time, to watch.
 *   ?mode=...       override initial mode (`gungame` or `practice`).
 *   ?map=...        override initial arena map (`shoot-house` or `cargo-yard`).
 *   ?materials      every surface side by side, to check textures. No game.
 *   ?weapon         the default gun (or `?weapon=ak47`, `?weapon=awm`, etc.) from four sides.
 *   ?auto           nothing moves until a script calls window.__fps. Used by `npm run playtest`.
 */
const query = new URLSearchParams(window.location.search);
const mode = query.has('materials')
  ? 'materials'
  : query.has('weapon')
    ? 'weapon'
    : query.has('auto')
      ? 'auto'
      : query.has('bot')
        ? 'bot'
        : 'play';

function play(runMode: 'auto' | 'bot' | 'play') {
  const settings = createSettingsStore();
  const loadout = createLoadoutStore();
  const modeStore = createModeStore();

  const urlMode = query.get('mode');
  if (isGameModeId(urlMode)) {
    modeStore.set(urlMode);
  }
  const urlMap = query.get('map');
  if (isMapId(urlMap)) {
    modeStore.setMap(urlMap);
  }

  let activeMap: GameMap = getMapById(modeStore.getMap());
  const audio = createAudio();
  const view = createView(activeMap, audio);
  let bot = createBot(activeMap);
  let runSeedCounter = 1;

  function makeFreshState(modeId: GameModeId, mapSpec: GameMap): GameState {
    const seed =
      runMode === 'auto'
        ? 0x51a7e000 + runSeedCounter++
        : (Date.now() ^ (runSeedCounter++ * 0x9e3779b9)) >>> 0 || 1;
    return createGame(mapSpec, loadout.get(), 'primary', { mode: modeId, seed });
  }

  let previous = makeFreshState(modeStore.get(), activeMap);
  let state = previous;
  view.resetTargets(state);

  function resetMatch(modeOverride?: GameModeId, mapOverride?: MapId) {
    const nextMode = modeOverride ?? modeStore.get();
    const nextMapId = mapOverride ?? modeStore.getMap();
    modeStore.setSelection(nextMode, nextMapId);

    const nextMap = getMapById(nextMapId);
    const mapChanged = nextMap.id !== activeMap.id;
    activeMap = nextMap;

    previous = makeFreshState(nextMode, activeMap);
    state = previous;
    bot = createBot(activeMap);

    if (mapChanged) {
      view.setMap(activeMap, state);
    } else {
      view.resetTargets(state);
    }
  }

  function applyWeaponEquip(weaponId?: WeaponId, slotOverride?: WeaponSlot) {
    if (weaponId) loadout.equip(weaponId);
    const activeSlot =
      slotOverride ?? (weaponId ? getWeaponSpec(weaponId).slot : state.weapon.activeSlot);
    state = setGameLoadout(state, loadout.get(), activeSlot);
    previous = state;
  }

  function requestPlay(deployWeaponId?: WeaponId) {
    if (deployWeaponId) applyWeaponEquip(deployWeaponId);
    audio.start();
    if (runMode === 'play' && state.outcome === 'ongoing') {
      try {
        const lockRequest = view.canvas.requestPointerLock() as unknown;
        if (lockRequest instanceof Promise) {
          void lockRequest.catch(() => {
            ui.onPointerLockChanged(false, state);
          });
        }
      } catch {
        ui.onPointerLockChanged(false, state);
      }
    }
  }

  const ui = createGameUi({
    mode: runMode,
    totalTargets: activeMap.targets.length,
    audio,
    settings,
    loadout,
    modeStore,
    onRequestPlay: requestPlay,
    onSelectOperation: (modeId, mapId, deployNow) => {
      resetMatch(modeId, mapId);
      if (!deployNow) {
        ui.resetRunUi();
      }
    },
    onRestartRun: () => {
      resetMatch();
    },
    onQuitToTitle: () => {
      if (document.pointerLockElement === view.canvas) {
        document.exitPointerLock();
      }
      resetMatch();
    },
  });

  // If the player changes mode or map in the Game Modes & Maps screen while on the Title backdrop,
  // update the live 3D background preview immediately!
  modeStore.subscribe((sel) => {
    if ((state.mode !== sel.mode || state.mapId !== sel.mapId) && ui.isTitleBackdropActive()) {
      resetMatch(sel.mode, sel.mapId);
    }
  });

  // Live sync whenever the player changes weapons or mounted optics in Armory.
  loadout.subscribe((nextLoadout) => {
    const prevPrimary = state.weapon.loadout.primary;
    const prevSecondary = state.weapon.loadout.secondary;
    const switchedSlot: WeaponSlot =
      nextLoadout.primary !== prevPrimary
        ? 'primary'
        : nextLoadout.secondary !== prevSecondary
          ? 'secondary'
          : state.weapon.activeSlot;
    state = setGameLoadout(state, nextLoadout, switchedSlot);
    previous = state;
  });

  settings.subscribe((current) => {
    view.setFieldOfView(current.fov);
  });

  function step(input: GameInput): GameEvent[] {
    previous = state;
    const result = stepGame(state, input, SIM_STEP_SECONDS, activeMap);
    state = result.state;
    view.handle(result.events, state);
    ui.handleEvents(result.events, state);

    if (
      runMode === 'play' &&
      state.outcome !== 'ongoing' &&
      document.pointerLockElement === view.canvas
    ) {
      document.exitPointerLock();
    }
    return result.events;
  }

  const noLook = { yaw: 0, pitch: 0 };

  if (runMode === 'auto') {
    const drawCurrent = (dt: number) => {
      if (ui.isTitleBackdropActive()) {
        view.renderTitleBackdrop(dt, settings.get().reducedMotion, state);
      } else {
        view.frame(previous, state, 1, dt, noLook, true);
      }
      ui.update(dt, state, view.aimBlend(), view.scopeOverlay());
    };

    const run = (steps: number, input: (current: GameState) => GameInput) => {
      const events: GameEvent[] = [];
      for (let i = 0; i < steps; i++) {
        events.push(...step(input(state)));
        const isLast = i === steps - 1;
        view.frame(previous, state, 1, SIM_STEP_SECONDS, noLook, isLast);
        if (isLast) {
          ui.update(SIM_STEP_SECONDS * steps, state, view.aimBlend(), view.scopeOverlay());
        }
      }
      return events;
    };

    window.__fps = {
      state: () => state,
      step: (input = {}, steps = 1) =>
        run(steps, () => ({ ...NO_INPUT, fire: false, reload: false, aim: false, ...input })),
      bot: (steps = 1) => run(steps, bot),
      zoom: () => view.zoom(),
      loudness: measureSounds,
      openScreen: (screen) => {
        ui.openScreen(screen, state);
        drawCurrent(0.016);
      },
      screen: () => ui.screen(),
      mode: (nextMode) => {
        if (nextMode) {
          resetMatch(nextMode, activeMap.id);
          ui.resetRunUi();
          drawCurrent(0);
        }
        return state.mode;
      },
      map: (nextMap) => {
        if (nextMap) {
          resetMatch(state.mode, nextMap);
          ui.resetRunUi();
          drawCurrent(0);
        }
        return activeMap.id;
      },
      inspectMode: (modeId, mapId) => {
        ui.inspectMode(modeId, mapId);
        drawCurrent(0);
      },
      inspectMap: (mapId) => {
        ui.inspectMap(mapId);
        drawCurrent(0);
      },
      settings: (patch) => {
        if (patch) {
          settings.update(patch);
          drawCurrent(0);
        }
        return settings.get();
      },
      equipWeapon: (weaponId, activeSlot) => {
        applyWeaponEquip(weaponId, activeSlot);
        drawCurrent(0);
        return state;
      },
      setOptic: (weaponId, opticId) => {
        loadout.setOptic(weaponId, opticId);
        state = setGameLoadout(state, loadout.get(), state.weapon.activeSlot);
        previous = state;
        drawCurrent(0);
        return state;
      },
      renderStats: () => view.renderStats(),
      loadout: () => loadout.get(),
      inspectLoadout: (weaponId) => {
        ui.inspectLoadoutWeapon(weaponId);
      },
      selectSettingsTab: (tab) => {
        ui.selectSettingsTab(tab);
      },
      place: (position, yaw, pitch = 0) => {
        state = {
          ...state,
          player: {
            ...state.player,
            position: { ...position },
            velocity: { x: 0, y: 0, z: 0 },
            yaw,
            pitch,
            lean: 0,
            grounded: true,
          },
        };
        previous = state;
        drawCurrent(0);
      },
      restart: () => {
        resetMatch();
        ui.resetRunUi();
        drawCurrent(0);
      },
    };
    drawCurrent(0);
  } else {
    const human = createHumanInput(view.canvas);
    settings.subscribe((current) => {
      human.setSensitivity(current.mouseSensitivity, current.adsSensitivity);
      human.setControlPreferences({
        aimMode: current.aimMode,
        leanMode: current.leanMode,
        scrollWeaponSwitch: current.scrollWeaponSwitch,
      });
    });

    const loop = createFixedLoop();
    let lastTime = performance.now();

    if (runMode === 'bot') {
      window.addEventListener(
        'pointerdown',
        () => {
          audio.start();
        },
        { once: true },
      );
    } else {
      document.addEventListener('pointerlockchange', () => {
        ui.onPointerLockChanged(human.locked(), state);
      });
      view.canvas.addEventListener('click', () => {
        if (ui.screen() === 'playing' && !human.locked() && state.outcome === 'ongoing') {
          requestPlay();
        }
      });
      window.addEventListener('keydown', (e) => {
        if (ui.screen() !== 'playing') return;
        if (state.outcome !== 'ongoing') {
          if (e.key === 'Enter') {
            e.preventDefault();
            audio.uiConfirm();
            ui.resetRunUi();
            resetMatch();
            requestPlay();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            ui.openScreen('pause', state);
          }
        }
      });
    }

    const frame = (now: number) => {
      const elapsed = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;

      const running =
        runMode === 'bot' ||
        (ui.screen() === 'playing' && (human.locked() || state.outcome !== 'ongoing'));
      human.setAimState(view.zoom(), view.aimBlend());
      human.setActiveSlot(state.weapon.activeSlot);

      if (ui.isTitleBackdropActive()) {
        view.renderTitleBackdrop(elapsed, settings.get().reducedMotion, state);
        ui.update(elapsed, state, 0, view.scopeOverlay());
      } else {
        if (running) view.adapt(elapsed);
        const alpha = running
          ? loop.advance(elapsed, () =>
              step(
                runMode === 'bot'
                  ? bot(state)
                  : state.outcome === 'ongoing'
                    ? human.sample()
                    : { ...NO_INPUT, fire: false, reload: false, aim: false },
              ),
            )
          : 1;
        view.frame(
          previous,
          state,
          alpha,
          running ? elapsed : 0,
          running && runMode === 'play' && state.outcome === 'ongoing'
            ? human.pendingLook()
            : noLook,
        );
        ui.update(elapsed, state, view.aimBlend(), view.scopeOverlay());
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

if (mode === 'materials') {
  showMaterials();
} else if (mode === 'weapon') {
  const param = query.get('weapon');
  const opticParam = query.get('optic');
  const id: WeaponId = isWeaponId(param) ? param : 'hk416';
  const optic: OpticId | undefined = isOpticId(opticParam) ? opticParam : undefined;
  showWeapon(getWeaponSpec(id), optic);
} else {
  play(mode);
}
