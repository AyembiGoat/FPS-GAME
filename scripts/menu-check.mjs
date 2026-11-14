// Opens the main menu in a headless browser, visits every section, takes one
// screenshot of each into playtest/menu/, and checks the things a screenshot cannot:
// the name survives a reload, a finished run reaches the Profile section, a run
// starts from the Maps section, and coming back to the menu works.
//
//   npm run menu:check
//
// Unlike scripts/playtest.mjs it uses the dev server at MENU_URL
// (http://127.0.0.1:5173 by default) rather than starting its own, because the menu
// is only ever reached by a person opening the page.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const base = process.env.MENU_URL ?? 'http://127.0.0.1:5173';
const out = 'playtest/menu';
mkdirSync(out, { recursive: true });

async function findBrowser() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, env: process.env };
  const { default: chromium } = await import('@sparticuz/chromium');
  const executablePath = await chromium.executablePath();
  const libraries = path.join(tmpdir(), 'fps-game-chromium-libs');
  if (!existsSync(libraries)) {
    const require = createRequire(import.meta.url);
    const packageDir = path.dirname(path.dirname(require.resolve('@sparticuz/chromium')));
    const archive = path.join(tmpdir(), 'fps-game-chromium-libs.tar');
    writeFileSync(
      archive,
      brotliDecompressSync(readFileSync(path.join(packageDir, 'bin', 'al2023.tar.br'))),
    );
    mkdirSync(libraries, { recursive: true });
    execFileSync('tar', ['-xf', archive, '-C', libraries]);
  }
  const libraryPath = [path.join(libraries, 'lib'), process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':');
  return { executablePath, env: { ...process.env, LD_LIBRARY_PATH: libraryPath } };
}

const { executablePath, env } = await findBrowser();
const browser = await puppeteer.launch({
  executablePath,
  env,
  headless: 'shell',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
};
// offsetParent is null for anything fixed to the screen, so ask the browser directly.
const visible = (selector) =>
  page.evaluate((s) => document.querySelector(s)?.checkVisibility() ?? false, selector);

await page.goto(`${base}/?records`, { waitUntil: 'load' });
await page.waitForSelector('#menu:not([hidden])');

// One screenshot per section, in the order the navigation lists them.
for (const [index, section] of ['profile', 'loadout', 'skins', 'play'].entries()) {
  await page.click(`.nav-button[data-section="${section}"]`);
  await shot(`0${index + 1}-${section}`);
}

// A placeholder is labelled and cannot be picked.
await page.click('.nav-button[data-section="loadout"]');
const placeholders = await page.evaluate(() => ({
  labelled: document.querySelectorAll('.option.placeholder .tag').length,
  disabled: document.querySelectorAll('.option.placeholder:disabled').length,
}));

// The name is typed, survives a reload, and shows in the bar.
await page.click('.nav-button[data-section="profile"]');
await page.click('.text-input');
await page.type('.text-input', 'Ash');
const nameAfterTyping = await page.$eval('.menu-name', (el) => el.textContent);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#menu:not([hidden])');
const nameAfterReload = await page.$eval('.text-input', (el) => el.value);
const barAfterReload = await page.$eval('.menu-name', (el) => el.textContent);
await page.screenshot({ path: `${out}/05-name-after-reload.png` });

// One finished run, recorded for real, then shown under Profile.
await page.click('.nav-button[data-section="play"]');
await page.click('.start-button');
if (!(await page.evaluate(() => window.__fps !== undefined))) {
  throw new Error('Starting the map did not leave the menu');
}
await page.evaluate(async () => {
  for (let i = 0; i < 60 * 180; i += 10) {
    window.__fps.bot(10);
    if (window.__fps.state().targetsDown.every(Boolean)) return;
  }
  throw new Error('The bot could not clear the map from the menu');
});
// One drawn step, so the screenshot below shows the cleared map.
await page.evaluate(() => window.__fps.step({}, 1));
const playAfterStart = {
  overlay: await visible('#overlay'),
  menu: await visible('#menu'),
};
await shot('06-after-start');

await page.evaluate(() => document.getElementById('to-menu')?.click());
await page.waitForSelector('#menu:not([hidden])');
const playAfterReturn = {
  overlay: await visible('#overlay'),
  menu: await visible('#menu'),
};

// Starting again gives a fresh run: every target standing.
await page.click('.nav-button[data-section="play"]');
await page.click('.start-button');
const freshRun = await page.evaluate(() => {
  const state = window.__fps.state();
  return {
    down: state.targetsDown.filter(Boolean).length,
    menu: document.getElementById('menu')?.checkVisibility() ?? false,
  };
});
await page.evaluate(() => document.getElementById('to-menu')?.click());
await page.waitForSelector('#menu:not([hidden])');
await page.click('.nav-button[data-section="profile"]');
const recordedRuns = await page.$$eval('.runs tbody tr', (rows) =>
  rows.map((row) => [...row.children].map((cell) => cell.textContent ?? '')),
);
await shot('07-back-at-menu');

// A narrower window and a long name, to see that both still fit.
await page.setViewport({ width: 1024, height: 700 });
await page.$eval('.text-input', (el) => {
  el.value = '';
  el.dispatchEvent(new Event('input'));
});
await page.type('.text-input', 'Alexandra Montgomery');
await page.screenshot({ path: `${out}/08-narrow-long-name.png` });
await page.setViewport({ width: 1280, height: 720 });

// The pause screen, which is what a person sees when they press Esc mid-run.
await page.click('.nav-button[data-section="play"]');
await page.click('.start-button');
await page.evaluate(() => window.__fps.step({}, 1));
await page.evaluate(() => {
  document.getElementById('overlay').hidden = false;
});
await page.screenshot({ path: `${out}/09-paused.png` });
await page.evaluate(() => {
  document.getElementById('overlay').hidden = true;
  document.getElementById('to-menu')?.click();
});

console.log(
  JSON.stringify(
    {
      nameAfterTyping,
      nameAfterReload,
      barAfterReload,
      placeholders,
      playAfterStart,
      playAfterReturn,
      freshRun,
      recordedRuns,
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
const failed =
  nameAfterTyping !== 'Ash' ||
  nameAfterReload !== 'Ash' ||
  barAfterReload !== 'Ash' ||
  placeholders.labelled !== placeholders.disabled ||
  playAfterStart.menu ||
  !playAfterReturn.menu ||
  freshRun.down !== 0 ||
  recordedRuns.length !== 1;
if (failed) throw new Error('A menu check did not hold; see the values above');
if (errors.length > 0) process.exit(1);
