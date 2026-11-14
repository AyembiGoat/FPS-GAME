import { createBot } from '../core/bot';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame, WEAPON } from '../core/game';
import { shootHouse } from '../core/maps/shootHouse';
import { NO_INPUT } from '../core/player';
import { createAudio, measureSounds } from './audio';
import { createHumanInput } from './input';
import { showMaterials } from './materials/preview';
import { createGameUi } from './ui';
import { createSettingsStore } from './ui/settings';
import { createView } from './view';
import { showWeapon } from './weapons/preview';

/**
 * Ways to run:
 *   (default)  a person plays with keyboard and mouse from the live Title Screen.
 *   ?bot       the bot plays in real time, to watch.
 *   ?materials every surface side by side, to check textures. No game.
 *   ?weapon    the gun and hands from four sides, to check the grip. No game.
 *   ?auto      nothing moves until a script calls window.__fps. Used by
 *              `npm run playtest` so an agent can drive the game and take screenshots.
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
  const map = shootHouse;
  const settings = createSettingsStore();
  const audio = createAudio();
  const view = createView(map, audio);
  let bot = createBot(map);

  let previous = createGame(map);
  let state = previous;

  function resetMatch() {
    previous = createGame(map);
    state = previous;
    bot = createBot(map);
    view.resetTargets(state);
  }

  function requestPlay() {
    audio.start();
    if (runMode === 'play') {
      try {
        const lockRequest = view.canvas.requestPointerLock() as unknown;
        if (lockRequest instanceof Promise) {
          void lockRequest.catch(() => {
            // Browser rejected lock (e.g. rapid Escape cooldown); return cleanly to pause/title.
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
    totalTargets: map.targets.length,
    audio,
    settings,
    onRequestPlay: requestPlay,
    onRestartRun: resetMatch,
    onQuitToTitle: () => {
      if (document.pointerLockElement === view.canvas) {
        document.exitPointerLock();
      }
      resetMatch();
    },
  });

  settings.subscribe((current) => {
    view.setFieldOfView(current.fov);
  });

  function step(input: GameInput): GameEvent[] {
    previous = state;
    const result = stepGame(state, input, SIM_STEP_SECONDS, map);
    state = result.state;
    view.handle(result.events, state);
    ui.handleEvents(result.events, state);
    return result.events;
  }

  const noLook = { yaw: 0, pitch: 0 };

  if (runMode === 'auto') {
    const drawCurrent = (dt: number) => {
      if (ui.isTitleBackdropActive()) {
        view.renderTitleBackdrop(dt, settings.get().reducedMotion);
      } else {
        view.frame(previous, state, 1, dt, noLook, true);
      }
      ui.update(dt, state, view.aimBlend());
    };

    /** Run steps with animations advancing in game time, and draw once at the end. */
    const run = (steps: number, input: (current: GameState) => GameInput) => {
      const events: GameEvent[] = [];
      for (let i = 0; i < steps; i++) {
        events.push(...step(input(state)));
        const isLast = i === steps - 1;
        view.frame(previous, state, 1, SIM_STEP_SECONDS, noLook, isLast);
        ui.update(SIM_STEP_SECONDS, state, view.aimBlend());
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
      settings: (patch) => {
        if (patch) {
          settings.update(patch);
          drawCurrent(0);
        }
        return settings.get();
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
    });

    const loop = createFixedLoop();
    let lastTime = performance.now();

    if (runMode === 'bot') {
      // Sound needs a click first; the bot plays silently until then.
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
      // Clicking the canvas directly while unpaused also captures pointer lock.
      view.canvas.addEventListener('click', () => {
        if (ui.screen() === 'playing' && !human.locked()) {
          requestPlay();
        }
      });
    }

    const frame = (now: number) => {
      const elapsed = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;

      const running = runMode === 'bot' || (ui.screen() === 'playing' && human.locked());
      human.setAimState(view.zoom(), view.aimBlend());

      if (ui.isTitleBackdropActive()) {
        view.renderTitleBackdrop(elapsed, settings.get().reducedMotion);
        ui.update(elapsed, state, 0);
      } else {
        if (running) view.adapt(elapsed);
        const alpha = running
          ? loop.advance(elapsed, () => step(runMode === 'bot' ? bot(state) : human.sample()))
          : 1;
        view.frame(
          previous,
          state,
          alpha,
          running ? elapsed : 0,
          running && runMode === 'play' ? human.pendingLook() : noLook,
        );
        ui.update(elapsed, state, view.aimBlend());
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

if (mode === 'materials') {
  showMaterials();
} else if (mode === 'weapon') {
  showWeapon(WEAPON);
} else {
  play(mode);
}
