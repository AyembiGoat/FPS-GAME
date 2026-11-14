import { createBot } from '../core/bot';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame, WEAPON } from '../core/game';
import { shootHouse } from '../core/maps/shootHouse';
import { NO_INPUT } from '../core/player';
import { createAudio, measureSounds } from './audio';
import { createHumanInput } from './input';
import { showMaterials } from './materials/preview';
import { showWeapon } from './weapons/preview';
import { createView } from './view';

/**
 * Three ways to run:
 *   (default)  a person plays with keyboard and mouse.
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

function play(mode: 'auto' | 'bot' | 'play') {
  const map = shootHouse;
  const audio = createAudio();
  const view = createView(map, audio);
  const bot = createBot(map);

  let previous = createGame(map);
  let state = previous;

  function step(input: GameInput): GameEvent[] {
    previous = state;
    const result = stepGame(state, input, SIM_STEP_SECONDS, map);
    state = result.state;
    view.handle(result.events, state);
    return result.events;
  }

  const noLook = { yaw: 0, pitch: 0 };
  const overlay = document.getElementById('overlay');

  if (mode === 'auto') {
    if (overlay) overlay.hidden = true;

    /** Run steps with animations advancing in game time, and draw once at the end. */
    const run = (steps: number, input: (state: GameState) => GameInput) => {
      const events: GameEvent[] = [];
      for (let i = 0; i < steps; i++) {
        events.push(...step(input(state)));
        view.frame(previous, state, 1, SIM_STEP_SECONDS, noLook, i === steps - 1);
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
    };
    view.frame(previous, state, 1, 0, noLook);
  } else {
    const human = createHumanInput(view.canvas);
    const loop = createFixedLoop();
    let lastTime = performance.now();

    if (mode === 'bot') {
      if (overlay) overlay.hidden = true;
      // Sound needs a click first; the bot plays silently until then.
      window.addEventListener(
        'pointerdown',
        () => {
          audio.start();
        },
        { once: true },
      );
    } else {
      overlay?.addEventListener('click', () => {
        audio.start();
        void view.canvas.requestPointerLock();
      });
      document.addEventListener('pointerlockchange', () => {
        if (overlay) overlay.hidden = human.locked();
      });
    }

    const frame = (now: number) => {
      const elapsed = Math.min((now - lastTime) / 1000, 0.25);
      lastTime = now;

      // The game is paused whenever the mouse is not captured.
      const running = mode === 'bot' || human.locked();
      human.setZoom(view.zoom());
      if (running) view.adapt(elapsed);
      const alpha = running
        ? loop.advance(elapsed, () => step(mode === 'bot' ? bot(state) : human.sample()))
        : 1;
      // Unconsumed mouse movement goes straight to the camera so aiming never lags a step.
      view.frame(previous, state, alpha, elapsed, mode === 'play' ? human.pendingLook() : noLook);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

const overlayElement = document.getElementById('overlay');
if (mode === 'materials' || mode === 'weapon') {
  if (overlayElement) overlayElement.hidden = true;
  for (const element of document.querySelectorAll<HTMLElement>('.hud')) element.hidden = true;
  if (mode === 'materials') showMaterials();
  else showWeapon(WEAPON);
} else {
  play(mode);
}
