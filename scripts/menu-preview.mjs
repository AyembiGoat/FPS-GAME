// Opens the main menu in a headless browser and saves a screenshot of every
// section, then checks that the name survives a reload, that a run is recorded
// for real, and that starting and leaving the game work.
//
//   node scripts/menu-preview.mjs
//
// Saves to menu-preview/. Exits non-zero if the page logs an error or a check fails.

import { mkdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const menu = await launchGame({ mode: 'testmenu' });
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = passed;
};
const shot = async (name) => {
  // Headless Chromium can keep a stale tile for part of the page. Hiding and
  // showing the menu forces it to repaint before the screenshot, without
  // changing whether the menu is up.
  await menu.page.evaluate(async () => {
    const found = document.getElementById('menu');
    if (found === null || !found.hidden) {
      const wasHidden = found?.hidden === true;
      if (found !== null) found.hidden = true;
      await new Promise((done) => requestAnimationFrame(done));
      if (found !== null) found.hidden = wasHidden;
    } else {
      await new Promise((done) => requestAnimationFrame(done));
    }
    await new Promise((done) => setTimeout(done, 250));
  });
  return menu.screenshot(`menu-preview/${name}.png`);
};

/** Click a button in the menu by its exact visible text. */
const click = (label) =>
  menu.page.evaluate((text) => {
    const buttons = [...document.querySelectorAll('#menu button')];
    const found = buttons.find((button) => button.textContent.trim() === text);
    if (!found) throw new Error(`No button labelled ${text}`);
    if (found.disabled) throw new Error(`Button ${text} is disabled`);
    found.click();
  }, label);

// Position fixed elements have no offsetParent, so check the computed display.
const visible = (selector) =>
  menu.page.evaluate((sel) => {
    const found = document.querySelector(sel);
    if (found === null || found.hidden) return false;
    return getComputedStyle(found).display !== 'none';
  }, selector);

const text = (selector) =>
  menu.page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', selector);

try {
  await menu.page.waitForFunction(() => window.__fps !== undefined, { timeout: 60000 });
  await menu.page.evaluate(() => localStorage.clear());
  await menu.page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await menu.page.waitForFunction(() => window.__fps !== undefined, { timeout: 60000 });

  check('menu shows before the game', await visible('#menu'));
  check('pause overlay is hidden while in the menu', !(await visible('#overlay')));
  await shot('01-profile');

  // Name: set it, reload, and see that it is still there.
  await click('Profile');
  await menu.page.evaluate(() => {
    const input = document.querySelector('#menu input');
    if (!(input instanceof HTMLInputElement)) throw new Error('No name input');
    input.value = 'Tester';
  });
  await click('Save name');
  await menu.page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await menu.page.waitForFunction(() => window.__fps !== undefined, { timeout: 60000 });
  check('name survives a reload', (await text('#menu')).includes('Tester'));
  await shot('02-profile-named');

  // A real run: clear the map with the bot, then see it listed.
  const steps = [];
  for (let i = 0; i < 60 * 180; i += 10) {
    const events = await menu.bot(10);
    steps.push(...events);
    const state = await menu.state();
    if (state.targetsDown.every(Boolean)) break;
  }
  const runs = await menu.page.evaluate(() =>
    JSON.parse(localStorage.getItem('fps-game:runs') ?? '[]'),
  );
  check('a cleared map is recorded as a run', runs.length === 1 && runs[0].targetsHit === 10);

  // Reload, so the menu reads the run it just saved rather than its own copy.
  await menu.page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await menu.page.waitForFunction(() => window.__fps !== undefined, { timeout: 60000 });
  await click('Profile');
  await menu.page.evaluate(() => document.querySelector('#menu-content').scrollTo({ top: 9999 }));
  await shot('03b-profile-character');
  await menu.page.evaluate(() => document.querySelector('#menu-content').scrollTo({ top: 0 }));
  const profile = await text('#menu');
  check('the run is listed in Profile after a reload', profile.includes('Knock down all targets'));
  const stats = await menu.page.evaluate(() =>
    [...document.querySelectorAll('#menu .menu-pairs dt')].map((term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]),
  );
  check(
    'the run counts towards player stats',
    JSON.stringify(stats) ===
      JSON.stringify([
        ['Runs played', '1'],
        ['Best time', `${runs[0].time.toFixed(1)}s`],
        ['Shots fired', String(runs[0].shots)],
        ['Accuracy', '100%'],
      ]),
  );
  await shot('03-profile-runs');

  // Every other section.
  await click('Loadout');
  check('loadout slots are listed', (await text('#menu')).includes('Loadout 2'));
  check('M1911 is marked as in the game', (await text('#menu')).includes('M1911 — in the game'));
  await click('AK-47 — not in the game yet');
  await shot('04-loadout');
  await click('Loadout 2');
  await shot('05-loadout-slot-2');
  await menu.page.evaluate(() => document.querySelector('#menu-content').scrollTo({ top: 9999 }));
  await shot('05b-loadout-attachments');

  await click('Skins');
  await shot('06-skins');
  await click('Desert tan');
  check(
    'skins are marked as not in the game',
    (await text('#menu')).includes('Skins are not in the game yet'),
  );
  await shot('07-skins-picked');

  await click('Maps');
  await shot('08-maps');
  await click('Warehouse — not in the game yet');
  await shot('08b-maps-warehouse');
  const startDisabled = await menu.page.evaluate(() => {
    const button = [...document.querySelectorAll('#menu button')].find(
      (candidate) => candidate.textContent.trim() === 'Start game',
    );
    return button instanceof HTMLButtonElement ? button.disabled : null;
  });
  check('start is unavailable for a map that is not in the game', startDisabled === true);
  await shot('09-maps-not-in-game');

  await click('Shoot House — in the game');
  await click('Start game');
  check(
    'the pause screen explains how to get back to the menu',
    (await text('#overlay-prompt')) === 'Click to play',
  );
  check('start hides the menu', !(await visible('#menu')));
  check('start shows the pause overlay', await visible('#overlay'));
  await shot('10-starting');

  // Play a moment, then go back to the menu from the pause screen.
  await menu.step({ forward: 1 }, 5);
  await menu.page.evaluate(() => {
    document.querySelector('#overlay-menu')?.click();
  });
  check('the menu comes back from the pause screen', await visible('#menu'));
  check('the pause overlay hides when the menu is back', !(await visible('#overlay')));
  await shot('11-back-to-menu');

  summary.runs = runs;
  summary.shotEvents = steps.filter((event) => event.type === 'shot').length;
} finally {
  summary.errors = menu.errors;
  await menu.close();
}

mkdirSync('menu-preview', { recursive: true });
console.log(JSON.stringify(summary, null, 2));
const failed = Object.values(summary.checks).some((passed) => !passed);
if (summary.errors.length > 0 || failed) process.exit(1);
