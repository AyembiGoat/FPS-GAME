import { createBot } from '../core/bot';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame, WEAPON } from '../core/game';
import type { GameMap } from '../core/map';
import { shootHouse } from '../core/maps/shootHouse';
import { NO_INPUT } from '../core/player';
import type { GameAudio } from './audio';
import { createAudio, measureSounds } from './audio';
import { createControls } from './controls';
import { elementById } from './dom';
import { createHumanInput } from './input';
import { SHOOT_HOUSE, TARGET_PRACTICE } from './menu/content';
import { createMenu } from './menu/menu';
import { showMaterials } from './materials/preview';
import { createView } from './view';
import { showWeapon } from './weapons/preview';

/**
 * How the page can run:
 *   (default)  a person plays, starting from the main menu.
 *   ?bot       the bot plays in real time, to watch. No menu.
 *   ?materials every surface side by side, to check textures. No game, no menu.
 *   ?weapon    the gun and hands from four sides, to check the grip. No game, no menu.
 *   ?auto      nothing moves until a script calls window.__fps. Used by
 *              `npm run playtest` so an agent can drive the game and take screenshots.
 *              No menu.
 *   ?records   like ?auto, but opens the menu first. Start a map, then drive the bot
 *              through window.__fps to check that a finished run reaches the Profile
 *              section. See scripts/menu-check.mjs.
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
        : query.has('records')
          ? 'records'
          : 'play';

const NO_LOOK = { yaw: 0, pitch: 0 };
const map = shootHouse;

/**
 * One map, ready to play from the spawn and to be put back there afterwards. The view
 * is built on demand: it needs the GPU and a moment to compile its shaders, and the
 * menu never shows the world behind it.
 */
function createSession(gameMap: GameMap, audio: GameAudio) {
  let view: ReturnType<typeof createView> | null = null;
  let previous = createGame(gameMap);
  let state = previous;

  return {
    view() {
      view ??= createView(gameMap, audio);
      return view;
    },
    state: () => state,

    /** Advance one simulation step. The view plays whatever the step's events call for. */
    step(input: GameInput): GameEvent[] {
      previous = state;
      const result = stepGame(state, input, SIM_STEP_SECONDS, gameMap);
      state = result.state;
      view?.handle(result.events, state);
      return result.events;
    },

    /** Back to the spawn, with the targets standing and no bullet holes around. */
    reset() {
      previous = createGame(gameMap);
      state = previous;
      view?.reset();
    },

    frame(alpha: number, dt: number, look: { yaw: number; pitch: number }, draw = true) {
      view?.frame(previous, state, alpha, dt, look, draw);
    },
  };
}

/**
 * The hooks `npm run playtest` and scripts/menu-check.mjs drive the game through.
 * Every step goes through the caller's own step function, so a run started from the
 * menu is timed and recorded exactly as a played one is.
 */
function automation(
  session: ReturnType<typeof createSession>,
  view: ReturnType<typeof createView>,
  advance: (input: GameInput) => GameEvent[],
) {
  const bot = createBot(map);

  /** Run steps with animations advancing in game time, and draw once at the end. */
  const run = (steps: number, input: (state: GameState) => GameInput) => {
    const events: GameEvent[] = [];
    for (let i = 0; i < steps; i++) {
      events.push(...advance(input(session.state())));
      session.frame(1, SIM_STEP_SECONDS, NO_LOOK, i === steps - 1);
    }
    return events;
  };

  window.__fps = {
    state: session.state,
    step: (input = {}, steps = 1) =>
      run(steps, () => ({ ...NO_INPUT, fire: false, reload: false, aim: false, ...input })),
    bot: (steps = 1) => run(steps, bot),
    zoom: () => view.zoom(),
    loudness: measureSounds,
  };
  return { bot };
}

/** `?auto` and `?bot`: play with no menu, as the playtest does. */
function runAutomated(mode: 'auto' | 'bot') {
  const audio = createAudio();
  const session = createSession(map, audio);
  const view = session.view();
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.hidden = true;

  const { bot } = automation(session, view, (input) => session.step(input));
  if (mode === 'auto') {
    session.frame(1, 0, NO_LOOK);
    return;
  }

  // Sound needs a click first; the bot plays silently until then.
  window.addEventListener(
    'pointerdown',
    () => {
      audio.start();
    },
    { once: true },
  );

  const loop = createFixedLoop();
  let lastTime = performance.now();
  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    view.adapt(elapsed);
    const alpha = loop.advance(elapsed, () => {
      session.step(bot(session.state()));
    });
    session.frame(alpha, elapsed, NO_LOOK);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** The main menu, and the game behind it. */
function runWithMenu(scripted: boolean) {
  const audio = createAudio();
  const session = createSession(map, audio);
  const overlay = elementById('overlay');
  const notice = elementById('pause-notice');
  elementById('pause-controls').append(createControls());

  const loop = createFixedLoop();
  let input: ReturnType<typeof createHumanInput> | null = null;
  /** False while the menu is open. The world is not built until a run starts. */
  let inRun = false;

  // A run is measured from the first step to the last target falling.
  let seconds = 0;
  let shots = 0;
  let recorded = false;

  function recordRun() {
    recorded = true;
    menu.recordRun({
      map: SHOOT_HOUSE.name,
      mode: TARGET_PRACTICE.name,
      seconds,
      targetsHit: map.targets.length,
      targetsTotal: map.targets.length,
      shotsFired: shots,
      date: new Date().toISOString(),
    });
  }

  /** Step the run and keep its clock and shot count. */
  function stepRun(runInput: GameInput): GameEvent[] {
    const events = session.step(runInput);
    seconds += SIM_STEP_SECONDS;
    shots += events.filter((event) => event.type === 'shot').length;
    if (!recorded && session.state().targetsDown.every(Boolean)) recordRun();
    // The targets stand back up after a clear, which starts the next run.
    if (events.some((event) => event.type === 'targets-reset')) {
      seconds = 0;
      shots = 0;
      recorded = false;
    }
    return events;
  }

  const menu = createMenu({
    start() {
      const view = session.view();
      audio.start();
      menu.close();
      inRun = true;
      if (scripted) {
        automation(session, view, stepRun);
        return;
      }
      overlay.hidden = true;
      notice.hidden = true;
      input ??= createHumanInput(view.canvas);
      // Without the mouse the game gets no input, so offer the pause screen instead.
      view.canvas.requestPointerLock().catch(() => {
        overlay.hidden = false;
        notice.hidden = false;
      });
    },
  });

  // The pause screen's own click asks for the mouse, so these must not ask twice.
  elementById('to-resume').addEventListener('click', (event) => {
    event.stopPropagation();
    session
      .view()
      .canvas.requestPointerLock()
      .catch(() => {});
  });

  elementById('to-menu').addEventListener('click', (event) => {
    event.stopPropagation();
    if (document.pointerLockElement !== null) document.exitPointerLock();
    overlay.hidden = true;
    notice.hidden = true;
    inRun = false;
    seconds = 0;
    shots = 0;
    recorded = false;
    session.reset();
    if (input) input.setZoom(1);
    menu.open();
  });

  overlay.addEventListener('click', () => {
    session
      .view()
      .canvas.requestPointerLock()
      .catch(() => {});
  });

  document.addEventListener('pointerlockchange', () => {
    // Losing the mouse mid-run pauses the game, as it always has.
    overlay.hidden = document.pointerLockElement !== null || menu.isOpen();
    if (document.pointerLockElement !== null) notice.hidden = true;
  });

  document.addEventListener('pointerlockerror', () => {
    if (menu.isOpen()) return;
    overlay.hidden = false;
    notice.hidden = false;
  });

  let lastTime = performance.now();
  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    if (inRun && input) {
      const locked = input.locked();
      if (locked) session.view().adapt(elapsed);
      input.setZoom(session.view().zoom());
      const alpha = locked
        ? loop.advance(elapsed, () => {
            if (input) stepRun(input.sample());
          })
        : 1;
      session.frame(alpha, elapsed, locked ? input.pendingLook() : NO_LOOK, locked);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  menu.open();
}

const overlayElement = document.getElementById('overlay');
if (mode === 'materials' || mode === 'weapon') {
  if (overlayElement) overlayElement.hidden = true;
  for (const element of document.querySelectorAll<HTMLElement>('.hud')) element.hidden = true;
  if (mode === 'materials') showMaterials();
  else showWeapon(WEAPON);
} else if (mode === 'auto' || mode === 'bot') {
  runAutomated(mode);
} else {
  runWithMenu(mode === 'records');
}
