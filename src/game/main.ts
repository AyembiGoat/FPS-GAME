import { createBot } from '../core/bot';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame, WEAPON } from '../core/game';
import { shootHouse } from '../core/maps/shootHouse';
import { NO_INPUT } from '../core/player';
import { createAudio, measureSounds } from './audio';
import { createHumanInput } from './input';
import { showMaterials } from './materials/preview';
import { createMenu } from './menu';
import { addRun } from './menu/state';
import { createRunRecorder } from './run';
import { showWeapon } from './weapons/preview';
import { createView } from './view';

/**
 * Ways to run:
 *   (default)  the main menu, then a person plays with keyboard and mouse.
 *   ?bot       the bot plays in real time, to watch. No menu.
 *   ?materials every surface side by side, to check textures. No game, no menu.
 *   ?weapon    the gun and hands from four sides, to check the grip. No game, no menu.
 *   ?auto      no menu, and nothing moves until a script calls window.__fps. Used by
 *              `npm run playtest` so an agent can drive the game and take screenshots.
 *   ?testmenu  the menu, and window.__fps may move the game too. Used by
 *              `node scripts/menu-preview.mjs` to check the menu in a browser.
 */
const query = new URLSearchParams(window.location.search);
const mode = query.has('materials')
  ? 'materials'
  : query.has('weapon')
    ? 'weapon'
    : query.has('auto')
      ? 'auto'
      : query.has('testmenu')
        ? 'testmenu'
        : query.has('bot')
          ? 'bot'
          : 'play';

const OVERLAY_TEXT = {
  paused: 'Paused. Click to resume, or open the main menu.',
  click: 'Click to play',
} as const;

function play(mode: 'auto' | 'bot' | 'play' | 'testmenu') {
  const map = shootHouse;
  const audio = createAudio();
  const view = createView(map, audio);
  const bot = createBot(map);
  const recorder = createRunRecorder(map.name, addRun);

  let previous = createGame(map);
  let state = previous;

  function step(input: GameInput): GameEvent[] {
    previous = state;
    const result = stepGame(state, input, SIM_STEP_SECONDS, map);
    state = result.state;
    view.handle(result.events, state);
    recorder.step(result.events, state.targetsDown);
    return result.events;
  }

  const noLook = { yaw: 0, pitch: 0 };
  const overlay = document.getElementById('overlay');
  const overlayPrompt = document.getElementById('overlay-prompt');
  const overlayMenu = document.getElementById('overlay-menu');
  const menuElement = document.getElementById('menu');

  /** Let a script drive the game, the way `npm run playtest` and the menu check do. */
  function exposeAutomation(): void {
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
  }

  if (mode === 'auto') {
    if (overlay) overlay.hidden = true;
    exposeAutomation();
    view.frame(previous, state, 1, 0, noLook);
    return;
  }

  if (mode === 'testmenu') {
    exposeAutomation();
    view.frame(previous, state, 1, 0, noLook);
    if (overlay) overlay.hidden = true;
    if (menuElement) {
      const menu = createMenu(menuElement, () => {
        menu.hide();
        if (overlay) overlay.hidden = false;
      });
      menu.show();
      // The pause screen's Main menu button, without needing the mouse captured.
      document.getElementById('overlay-menu')?.addEventListener('click', () => {
        if (overlay) overlay.hidden = true;
        menu.show();
      });
    }
    return;
  }

  const human = createHumanInput(view.canvas);
  const loop = createFixedLoop();
  let lastTime = performance.now();
  // A round only runs while the player is in the game and the mouse is captured.
  let playing = false;

  const menu = menuElement ? createMenu(menuElement, startPlaying) : null;

  function startPlaying() {
    menu?.hide();
    playing = true;
    if (overlayPrompt) overlayPrompt.textContent = OVERLAY_TEXT.click;
    if (overlay) overlay.hidden = false;
    if (overlayMenu) overlayMenu.hidden = true;
    audio.start();
    void view.canvas.requestPointerLock();
  }

  /** Esc, or the button on the pause screen, goes back to the menu. */
  function backToMenu() {
    playing = false;
    document.exitPointerLock();
    if (overlay) overlay.hidden = true;
    menu?.show();
  }

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
    overlayMenu?.addEventListener('click', (event) => {
      // Otherwise the click would also fall through and resume the game.
      event.stopPropagation();
      backToMenu();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = human.locked();
      if (overlay) overlay.hidden = locked || !playing;
      if (overlayPrompt) overlayPrompt.textContent = OVERLAY_TEXT.paused;
      if (overlayMenu) overlayMenu.hidden = false;
    });

    if (menu) {
      menu.show();
      if (overlay) overlay.hidden = true;
    } else if (overlay) {
      overlay.hidden = false;
    }
  }

  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    // The game is paused whenever the mouse is not captured.
    const running = mode === 'bot' || (playing && human.locked());
    human.setZoom(view.zoom());
    if (running) view.adapt(elapsed);
    const alpha = running
      ? loop.advance(elapsed, () => step(mode === 'bot' ? bot(state) : human.sample()))
      : 1;
    // Unconsumed mouse movement goes straight to the camera so aiming never lags a step.
    view.frame(previous, state, alpha, elapsed, mode === 'bot' ? noLook : human.pendingLook());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
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
