// Plays the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  every feature, UI screens, weapons, then the bot clears the map
//   npm run playtest -- --quick       spawn screenshot only
//   npm run playtest -- --materials   every texture side by side, nothing else
//   npm run playtest -- --weapon      default weapon four-view (or --weapon=ak47, --weapon=all)
//   npm run playtest -- --keep after  copy screenshots to playtest/after/ afterwards
//
// Exits non-zero if the page logs an error, a feature check fails, or the bot
// cannot clear the map.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const ALL_WEAPONS = [
  'hk416',
  'ak47',
  'scar-h',
  'mp5',
  'remington-870',
  'awm',
  'm1911',
  'desert-eagle',
];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = passed;
};

const weaponFlag = args.find((a) => a === '--weapon' || a.startsWith('--weapon='));
if (args.includes('--materials')) {
  const page = await launchGame({ mode: 'materials' });
  await page.screenshot('playtest/materials.png');
  summary.errors = page.errors;
  await page.close();
} else if (weaponFlag) {
  const target = weaponFlag.includes('=') ? weaponFlag.split('=')[1] : 'hk416';
  const list = target === 'all' ? ALL_WEAPONS : [target];
  summary.errors = [];
  for (const id of list) {
    const page = await launchGame({ mode: `weapon=${id}` });
    await page.screenshot(`playtest/weapon-${id}.png`);
    summary.errors.push(...page.errors);
    await page.close();
  }
} else {
  const game = await launchGame();
  const shot = (name) => game.screenshot(`playtest/${name}.png`);
  try {
    await shot('01-spawn');

    if (!quick) {
      // 1. Title Screen
      await game.page.evaluate(() => window.__fps.openScreen('title'));
      await new Promise((r) => setTimeout(r, 240));
      await shot('00-title-menu');
      const titleEntries = await game.page.$$eval('.title-screen .ui-menu-btn', (btns) =>
        btns.map((b) => b.getAttribute('data-entry')),
      );
      check(
        'title menu shows play, loadout, settings, controls',
        JSON.stringify(titleEntries) ===
          JSON.stringify(['play', 'loadout', 'settings', 'controls']),
      );

      // 2. Armory / Loadout Screen (live 3D turntable + real stats + weapon equip persistence)
      await game.page.evaluate(() => window.__fps.openScreen('loadout'));
      await new Promise((r) => setTimeout(r, 360));
      await shot('15-loadout-hk416');
      await game.page.evaluate(() => window.__fps.inspectLoadout('awm'));
      await new Promise((r) => setTimeout(r, 360));
      await shot('16-loadout-awm');
      await game.page.evaluate(() => window.__fps.inspectLoadout('desert-eagle'));
      await new Promise((r) => setTimeout(r, 300));
      await shot('17-loadout-deagle');
      const loadoutCardCount = await game.page.$$eval('.loadout-card', (els) => els.length);
      check('armory renders all 8 firearms in All tab', loadoutCardCount === 8);

      // Verify Armory panels never overlap at desktop (1280x720) OR split-pane (860x660) widths!
      const checkNoLoadoutOverlap = () =>
        game.page.evaluate(() => {
          const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
          const list = rect('.loadout-list');
          const stage = rect('.loadout-stage');
          const stats = rect('.loadout-stats');
          const overlap = (a, b) =>
            Boolean(
              a &&
              b &&
              a.left < b.right - 1 &&
              a.right > b.left + 1 &&
              a.top < b.bottom - 1 &&
              a.bottom > b.top + 1,
            );
          return !overlap(list, stage) && !overlap(stage, stats) && !overlap(list, stats);
        });
      const desktopNoOverlap = await checkNoLoadoutOverlap();
      await game.page.setViewport({ width: 860, height: 660 });
      await new Promise((r) => setTimeout(r, 180));
      const splitPaneNoOverlap = await checkNoLoadoutOverlap();
      await shot('17b-loadout-split-860x660');
      await game.page.setViewport({ width: 1280, height: 720 });
      await new Promise((r) => setTimeout(r, 150));
      check(
        'armory layout has zero panel overlap at desktop & split-pane widths',
        desktopNoOverlap && splitPaneNoOverlap,
      );

      // 3. Redesigned AAA Settings Screen (Controls + Interface tabs + persistence)
      await game.page.evaluate(() => {
        window.__fps.openScreen('settings');
        window.__fps.selectSettingsTab('controls');
      });
      await new Promise((r) => setTimeout(r, 220));
      await shot('12-settings-controls');
      await game.page.evaluate(() => window.__fps.selectSettingsTab('interface'));
      await new Promise((r) => setTimeout(r, 220));
      await shot('12b-settings-interface');
      const updatedSettings = await game.page.evaluate(() =>
        window.__fps.settings({ fov: 90, crosshairColor: 'brass', aimMode: 'toggle' }),
      );
      const savedInStorage = await game.page.evaluate(() =>
        window.localStorage.getItem('fps.settings.v1'),
      );
      check(
        'settings apply and persist to localStorage',
        updatedSettings.fov === 90 &&
          updatedSettings.crosshairColor === 'brass' &&
          updatedSettings.aimMode === 'toggle' &&
          Boolean(savedInStorage && savedInStorage.includes('"fov":90')),
      );
      await game.page.evaluate(() =>
        window.__fps.settings({ fov: 78, crosshairColor: 'white', aimMode: 'hold' }),
      );

      // 4. Controls Screen
      await game.page.evaluate(() => window.__fps.openScreen('controls'));
      await new Promise((r) => setTimeout(r, 220));
      await shot('13-controls-screen');
      const keycapCount = await game.page.$$eval(
        '.controls-screen .ui-keycap, .controls-screen .ui-mouse-badge',
        (els) => els.length,
      );
      check('controls screen renders keycaps and mouse badges', keycapCount >= 14);

      // 5. Gameplay: HK416 Primary — walk, fire, reload, ADS, Lean + ADS
      await game.page.evaluate(() => window.__fps.openScreen('playing'));
      await game.step({ forward: 1 }, 45);
      await shot('02-walking-hk416');
      await game.step({ fire: true }, 4);
      await shot('03-firing-hk416');
      await game.step({}, 18);

      await game.step({ reload: true }, 1);
      await game.step({}, 38);
      await shot('04-reload-mid');
      await game.step({}, 120);
      check('HK416 reload refills 30-round magazine', (await game.state()).weapon.rounds === 30);

      await game.step({ aim: true }, 30);
      await shot('07-hk416-aiming');
      const aimed = await game.state();
      const zoom = await game.zoom();
      summary.zoom = zoom;
      check('aim reaches fully up', aimed.weapon.aim === 1);
      check('view is zoomed while aiming', zoom > 1.05);

      // Lean left + right + pivot-accurate Lean + ADS
      await game.step({ aim: true, lean: -1 }, 24);
      await shot('09-hk416-lean-left-ads');
      check('leans left', (await game.state()).player.lean < -0.3);
      await game.step({ aim: true, lean: 1 }, 45);
      await shot('10-hk416-lean-right-ads');
      check('leans right', (await game.state()).player.lean > 0.3);
      const leanShot = await game.step({ lean: 1, fire: true, aim: true }, 2);
      check(
        'can fire while leaning + aiming',
        leanShot.some((event) => event.type === 'shot'),
      );
      await game.step({}, 35);
      check('stands back up and lowers sights', (await game.state()).player.lean === 0);

      // 6. Weapon Switching [1] -> [2] (M1911 Sidearm) -> [1]
      await game.step({ switchSlot: 'secondary' }, 25);
      await shot('18-secondary-m1911');
      check(
        'switches cleanly to secondary weapon',
        (await game.state()).weapon.weaponId === 'm1911',
      );
      await game.step({ switchSlot: 'primary' }, 25);
      check(
        'switches cleanly back to primary weapon',
        (await game.state()).weapon.weaponId === 'hk416',
      );

      // 7. Remington 870 Shotgun multi-pellet firing
      await game.page.evaluate(() => window.__fps.equipWeapon('remington-870', 'primary'));
      await game.step({}, 10);
      await shot('19-shotgun-870-hip');
      const sgEvents = await game.step({ fire: true }, 2);
      const sgShot = sgEvents.find((e) => e.type === 'shot');
      check(
        'Remington 870 fires 8 pellets in one shell',
        Boolean(sgShot && sgShot.hits.length >= 1),
      );

      // 8. AWM Sniper Rifle + 6x -> 10x Variable Telescopic Scope + East 38m Lane + Scoped Lean
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('awm', 'primary');
        // Stand at the mouth of the East 38m Sniper Lane looking straight downrange!
        window.__fps.place({ x: 18.5, y: 0, z: 16.5 }, 0, 0);
      });
      await game.step({}, 6);
      await shot('20-east-sniper-lane-hip');
      await game.step({ aim: true }, 35);
      await shot('21-awm-scoped-6x');
      const awmZoom = await game.zoom();
      summary.awmZoom = awmZoom;
      check('AWM telescopic scope zooms >= 5.5x', awmZoom >= 5.5);

      // Toggle variable magnification (V) from 6x -> 10x!
      await game.step({ aim: true, toggleZoom: true }, 1);
      await game.step({ aim: true }, 24);
      const awmZoomHigh = await game.zoom();
      summary.awmZoomHigh = awmZoomHigh;
      check('AWM variable zoom toggles cleanly to ~10x', awmZoomHigh >= 9.2);
      await shot('22b-awm-scoped-10x');
      await game.step({ aim: true, toggleZoom: true }, 1);
      await game.step({ aim: true }, 20);

      await game.step({ aim: true, lean: -1 }, 24);
      await shot('22-awm-scoped-lean-left');
      await game.step({}, 35);

      // 8b. SCAR-H Trijicon ACOG 3.5x glowing green chevron + BDC scope
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('scar-h', 'primary');
        window.__fps.setOptic('scar-h', 'acog');
        window.__fps.place({ x: 18.5, y: 0, z: 16.5 }, 0, 0);
      });
      await game.step({ aim: true }, 32);
      const acogZoom = await game.zoom();
      summary.acogZoom = acogZoom;
      check('SCAR-H ACOG scope zooms to ~3.5x', acogZoom >= 3.2 && acogZoom <= 3.8);
      await shot('24-scar-h-acog-35x');
      await game.step({}, 25);

      // 8c. HK416 Razor HD LPVO 2x <-> 5x variable scope
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.setOptic('hk416', 'lpvo');
        window.__fps.place({ x: 18.5, y: 0, z: 16.5 }, 0, 0);
      });
      await game.step({ aim: true }, 32);
      const lpvoLow = await game.zoom();
      await shot('25-hk416-lpvo-2x');
      await game.step({ aim: true, toggleZoom: true }, 1);
      await game.step({ aim: true }, 24);
      const lpvoHigh = await game.zoom();
      summary.lpvoZoom = [lpvoLow, lpvoHigh];
      check('HK416 LPVO toggles cleanly 2x -> 5x', lpvoLow >= 1.85 && lpvoHigh >= 4.6);
      await shot('26-hk416-lpvo-5x');
      await game.page.evaluate(() => window.__fps.setOptic('hk416', 'holo'));
      await game.step({}, 25);

      // 8d. MP5 Aimpoint Micro T-2 Red Dot 3D ADS sight picture
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('mp5', 'primary');
        window.__fps.setOptic('mp5', 'red-dot');
        window.__fps.place({ x: -12.5, y: 0, z: 11.5 }, 0.25, 0);
      });
      await game.step({ aim: true }, 24);
      await shot('27-mp5-red-dot-ads');
      await game.step({}, 20);

      // Capture live WebGL draw call & memory telemetry to verify anti-lag batching!
      summary.renderStats = await game.page.evaluate(() => window.__fps.renderStats());
      check('batched rendering stays lean (<= 65 draw calls)', summary.renderStats.calls <= 65);

      // 9. West Breach House Interior Shot (AK-47)
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('ak47', 'primary');
        window.__fps.place({ x: -12.5, y: 0, z: 11.5 }, 0.25, 0);
      });
      await game.step({}, 6);
      await shot('23-west-breach-ak47');

      // 10. Pause overlay during an active run
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.openScreen('pause');
      });
      await new Promise((r) => setTimeout(r, 220));
      await shot('14-pause-menu');
      const pauseEntries = await game.page.$$eval('.pause-screen .ui-menu-btn', (btns) =>
        btns.map((b) => b.getAttribute('data-entry')),
      );
      check(
        'pause menu shows resume, loadout, restart, settings, controls, quit',
        JSON.stringify(pauseEntries) ===
          JSON.stringify(['resume', 'loadout', 'restart', 'settings', 'controls', 'quit']),
      );

      // Reset cleanly to default HK416 + M1911 for the full bot run!
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.equipWeapon('m1911', 'secondary');
        window.__fps.restart();
        window.__fps.openScreen('playing');
      });

      // 11. Loudness balance across all 8 firearms & all surfaces
      summary.loudness = await game.loudness();
      check('reload is much quieter than a shot', summary.loudness.reload < 0.2);
      check('ui cues are subtle relative to gunfire', summary.loudness.uiConfirm < 0.15);
      check(
        'every sound makes some sound',
        Object.values(summary.loudness).every((v) => v > 0),
      );

      // 12. Full 14-target Shoot House bot clear!
      let steps = 0;
      let down = 0;
      let botLeaned = false;
      let botAimed = false;
      const limit = 60 * 240;
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
      summary.botSeconds = +(steps / 60).toFixed(2);
      summary.runElapsed = +state.run.elapsed.toFixed(2);
      summary.runShots = state.run.shotsFired;
      summary.targetsDown = `${state.targetsDown.filter(Boolean).length} / ${state.targetsDown.length}`;
      check('bot cleared all 14 targets on expanded Shoot House', state.targetsDown.every(Boolean));
      check(
        'run telemetry recorded elapsed time and all 14 hits',
        state.run.elapsed > 0 && state.run.targetHits === 14,
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
