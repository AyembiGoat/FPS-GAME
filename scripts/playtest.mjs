// Plays the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  every feature, UI screens, then the bot clears the map
//   npm run playtest -- --quick       spawn screenshot only
//   npm run playtest -- --materials   every texture side by side, nothing else
//   npm run playtest -- --weapon      the gun and hands from four sides, nothing else
//   npm run playtest -- --keep after  copy the screenshots to playtest/after/ afterwards,
//                                     to compare against an earlier run
//
// Exits non-zero if the page logs an error, a feature check fails, or the bot
// cannot clear the map.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = passed;
};

const preview = ['materials', 'weapon'].find((name) => args.includes(`--${name}`));
if (preview) {
  const page = await launchGame({ mode: preview });
  await page.screenshot(`playtest/${preview}.png`);
  summary.errors = page.errors;
  await page.close();
} else {
  const game = await launchGame();
  const shot = (name) => game.screenshot(`playtest/${name}.png`);
  try {
    await shot('01-spawn');

    if (!quick) {
      // Verify Title, Settings, Controls, and Pause UI screens plus settings persistence.
      await game.page.evaluate(() => window.__fps.openScreen('title'));
      await new Promise((r) => setTimeout(r, 240));
      await shot('00-title-menu');
      const titleEntries = await game.page.$$eval('.title-screen .ui-menu-btn', (btns) =>
        btns.map((b) => b.getAttribute('data-entry')),
      );
      check(
        'title menu shows play, settings, controls',
        JSON.stringify(titleEntries) === JSON.stringify(['play', 'settings', 'controls']),
      );

      await game.page.evaluate(() => window.__fps.openScreen('settings'));
      await new Promise((r) => setTimeout(r, 220));
      await shot('12-settings-screen');
      const updatedSettings = await game.page.evaluate(() =>
        window.__fps.settings({ fov: 90, crosshairColor: 'brass' }),
      );
      const savedInStorage = await game.page.evaluate(() =>
        window.localStorage.getItem('fps.settings.v1'),
      );
      check(
        'settings apply and persist to localStorage',
        updatedSettings.fov === 90 &&
          updatedSettings.crosshairColor === 'brass' &&
          Boolean(savedInStorage && savedInStorage.includes('"fov":90')),
      );
      await game.page.evaluate(() => window.__fps.settings({ fov: 78, crosshairColor: 'white' }));

      await game.page.evaluate(() => window.__fps.openScreen('controls'));
      await new Promise((r) => setTimeout(r, 220));
      await shot('13-controls-screen');
      const keycapCount = await game.page.$$eval(
        '.controls-screen .ui-keycap, .controls-screen .ui-mouse-badge',
        (els) => els.length,
      );
      check('controls screen renders keycaps and mouse badges', keycapCount >= 12);

      await game.page.evaluate(() => window.__fps.openScreen('playing'));

      // A person's first ten seconds: walk forward, fire, reload.
      await game.step({ forward: 1 }, 45);
      await shot('02-walking');
      await game.step({ fire: true }, 2);
      await shot('03-firing');
      await game.step({}, 20);

      // Reload: one screenshot at each beat of the animation.
      await game.step({ reload: true }, 1);
      const reloadSteps = {
        'a-magazine-out': 30,
        'b-hand-away': 30,
        'c-magazine-in': 22,
        'd-hand-back': 22,
      };
      for (const [name, steps] of Object.entries(reloadSteps)) {
        await game.step({}, steps);
        await shot(`04-reload-${name}`);
      }
      await game.step({}, 60);
      check('reload refills the magazine', (await game.state()).weapon.rounds === 7);

      // Aim: sights come up, the view zooms, and a shot still works.
      await game.step({ aim: true }, 30);
      await shot('07-aiming');
      const aimed = await game.state();
      const zoom = await game.zoom();
      summary.zoom = zoom;
      check('aim reaches fully up', aimed.weapon.aim === 1);
      check('view is zoomed while aiming', zoom > 1.01);
      const aimedShot = await game.step({ aim: true, fire: true }, 2);
      await shot('08-aiming-firing');
      check(
        'can fire while aiming',
        aimedShot.some((event) => event.type === 'shot'),
      );
      await game.step({}, 30);
      check('aim comes back down', (await game.state()).weapon.aim === 0);
      check('zoom returns to 1', (await game.zoom()) === 1);

      // Lean both ways, then fire while leaning.
      await game.step({ lean: -1 }, 20);
      await shot('09-lean-left');
      check('leans left', (await game.state()).player.lean < -0.3);
      await game.step({ lean: 1 }, 40);
      await shot('10-lean-right');
      check('leans right', (await game.state()).player.lean > 0.3);
      const leanShot = await game.step({ lean: 1, fire: true, aim: true }, 2);
      check(
        'can fire while leaning',
        leanShot.some((event) => event.type === 'shot'),
      );
      await game.step({ lean: 1, aim: true }, 20);
      await shot('11-lean-right-aiming');
      await game.step({}, 30);
      check('stands back up', (await game.state()).player.lean === 0);

      // Pause overlay during an active run.
      await game.page.evaluate(() => window.__fps.openScreen('pause'));
      await new Promise((r) => setTimeout(r, 220));
      await shot('14-pause-menu');
      const pauseEntries = await game.page.$$eval('.pause-screen .ui-menu-btn', (btns) =>
        btns.map((b) => b.getAttribute('data-entry')),
      );
      check(
        'pause menu shows resume, restart, settings, controls, quit',
        JSON.stringify(pauseEntries) ===
          JSON.stringify(['resume', 'restart', 'settings', 'controls', 'quit']),
      );
      await game.page.evaluate(() => {
        window.__fps.restart();
        window.__fps.openScreen('playing');
      });

      // Loudness, measured without speakers. Each value is a fraction of the gunshot.
      summary.loudness = await game.loudness();
      check('reload is much quieter than a shot', summary.loudness.reload < 0.2);
      check('ui cues are subtle relative to gunfire', summary.loudness.uiConfirm < 0.15);
      check(
        'every sound makes some sound',
        Object.values(summary.loudness).every((v) => v > 0),
      );

      // Then the bot plays a clean run from spawn. A screenshot after every target that goes down.
      let steps = 0;
      let down = 0;
      let botLeaned = false;
      let botAimed = false;
      const limit = 60 * 180;
      while (steps < limit) {
        const events = await game.bot(10);
        steps += 10;
        const state = await game.state();
        botLeaned ||= Math.abs(state.player.lean) > 0.1;
        botAimed ||= state.weapon.aim === 1;
        const fell = events.filter((event) => event.type === 'target-down').length;
        if (fell > 0) {
          down += fell;
          await shot(`05-target-${String(down).padStart(2, '0')}`);
        }
        if (state.targetsDown.every(Boolean)) break;
      }
      await game.step({}, 10);
      await new Promise((r) => setTimeout(r, 240));
      const state = await game.state();
      summary.botSeconds = steps / 60;
      summary.runElapsed = +state.run.elapsed.toFixed(2);
      summary.runShots = state.run.shotsFired;
      summary.targetsDown = `${state.targetsDown.filter(Boolean).length} / ${state.targetsDown.length}`;
      check('bot cleared the map', state.targetsDown.every(Boolean));
      check(
        'run telemetry recorded elapsed time and hits',
        state.run.elapsed > 0 && state.run.targetHits === 10,
      );
      check('bot aimed', botAimed);
      summary.botLeaned = botLeaned;
      await shot('06-cleared');
    }
  } finally {
    summary.errors = game.errors;
    await game.close();
  }
}

if (keep) {
  mkdirSync(`playtest/${keep}`, { recursive: true });
  for (const file of readdirSync('playtest')) {
    if (file.endsWith('.png')) cpSync(`playtest/${file}`, `playtest/${keep}/${file}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
const failed = Object.values(summary.checks).some((passed) => !passed);
if (summary.errors.length > 0 || failed) process.exit(1);
