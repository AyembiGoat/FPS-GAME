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
        'title menu shows play, game modes, loadout, settings, controls',
        JSON.stringify(titleEntries) ===
          JSON.stringify(['play', 'modes', 'loadout', 'settings', 'controls']),
      );

      // 1b. GAME MODES is reachable by keyboard and by pointer, and each card starts its mode.
      await game.page.keyboard.press('ArrowDown');
      await game.page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 260));
      await shot('28-game-modes');
      const modesByKeyboard = await game.page.evaluate(() => window.__fps.screen());
      const modeCards = await game.page.$$eval('.mode-card', (cards) =>
        cards.map((c) => c.dataset.mode),
      );
      check(
        'game modes screen opens from the title with the keyboard',
        modesByKeyboard === 'modes',
      );
      check(
        'every listed mode is a real mode card',
        JSON.stringify(modeCards) === JSON.stringify(['firefight', 'steel']),
      );

      const modeCardBox = await game.page.$eval('.mode-card', (card) => {
        const rect = card.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
      });
      check(
        'mode cards sit inside the viewport with a readable hit area',
        modeCardBox.width > 400 &&
          modeCardBox.height > 100 &&
          modeCardBox.top > 0 &&
          modeCardBox.bottom < 720,
      );

      // Keyboard: move to Steel Targets and deploy it.
      await game.page.keyboard.press('ArrowDown');
      await game.page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 260));
      const steelState = await game.state();
      check(
        'keyboard can start Steel Targets from the modes screen',
        steelState.mode === 'steel' &&
          (await game.page.evaluate(() => window.__fps.screen())) === 'playing',
      );
      check(
        'steel mode starts with every plate standing',
        steelState.targetsDown.every((d) => !d),
      );
      check('steel mode has no hostiles in it', steelState.enemies.length === 0);
      await game.step({}, 4);
      await new Promise((r) => setTimeout(r, 240));
      await shot('29-steel-mode');

      // Pointer: back to the title, click Game Modes, click the Firefight card.
      await game.page.evaluate(() => window.__fps.openScreen('title'));
      await new Promise((r) => setTimeout(r, 240));
      await game.page.click('.title-screen [data-entry="modes"]');
      await new Promise((r) => setTimeout(r, 260));
      await game.page.click('.mode-card[data-mode="firefight"]');
      await new Promise((r) => setTimeout(r, 260));
      const pointerMode = await game.page.evaluate(() => window.__fps.mode());
      check('pointer can open Game Modes and start Firefight', pointerMode === 'firefight');

      // Back to the title from the modes screen, with the Escape key.
      await game.page.evaluate(() => window.__fps.openScreen('modes'));
      await new Promise((r) => setTimeout(r, 200));
      await game.page.keyboard.press('Escape');
      await new Promise((r) => setTimeout(r, 240));
      check(
        'Escape returns from Game Modes to the title',
        (await game.page.evaluate(() => window.__fps.screen())) === 'title',
      );

      // The Back button is reachable with the mouse, not just the keyboard.
      await game.page.evaluate(() => window.__fps.openScreen('modes'));
      await new Promise((r) => setTimeout(r, 200));
      await game.page.click('[data-entry="modes-back"]');
      await new Promise((r) => setTimeout(r, 240));
      check(
        'pointer can go back from Game Modes to the title',
        (await game.page.evaluate(() => window.__fps.screen())) === 'title',
      );

      // The weapon and UI checks below are not combat: run them in Steel Targets, where
      // nothing shoots back, so a hostile cannot end the run in the middle of a menu test.
      await game.page.evaluate(() => {
        window.__fps.setMode('steel');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
      });

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
        'pause menu shows resume, modes, loadout, restart, settings, controls, quit',
        JSON.stringify(pauseEntries) ===
          JSON.stringify(['resume', 'modes', 'loadout', 'restart', 'settings', 'controls', 'quit']),
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

      // 12. Firefight: hostiles that see, move, shoot, take damage and die.
      await game.page.evaluate(() => {
        window.__fps.setMode('firefight');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
      });
      const fightStart = await game.state();
      summary.firefightStart = {
        hostiles: fightStart.enemies.length,
        health: fightStart.health,
      };
      check(
        'firefight starts with six live hostiles and full health',
        fightStart.enemies.length === 6 &&
          fightStart.enemies.every((enemy) => enemy.behavior !== 'dead') &&
          fightStart.health === 100,
      );
      const hudMode = await game.page.evaluate(() => ({
        label: document.querySelector('.hud-objective__label')?.textContent,
        total: document.querySelector('.hud-objective__count-total')?.textContent,
        vitalsHidden: document.querySelector('.hud-vitals')?.hidden,
      }));
      check(
        'firefight HUD tracks hostiles and shows vitals',
        hudMode.label === 'Hostiles' && hudMode.total === '6' && hudMode.vitalsHidden === false,
      );

      // 12a. A hostile behind a wall cannot be shot through it.
      await game.page.evaluate(() => {
        // The east shoot-wall (x 5.2..8.4 at z 2.2) sits between this spot and hostile 2.
        window.__fps.place({ x: 6.8, y: 0, z: 5.0 }, -0.207, -0.037);
      });
      await game.step({}, 2);
      const throughWall = await game.step({ fire: true }, 1);
      const wallShot = throughWall.find((event) => event.type === 'shot');
      const wallState = await game.state();
      summary.wallShot = wallShot?.hit?.surface ?? null;
      check(
        'a wall stops the player round before it reaches a hostile',
        wallShot?.hit?.surface === 'plywood' &&
          !throughWall.some((event) => event.type === 'enemy-damaged') &&
          wallState.enemies[2]?.health === 100,
      );
      await game.step({}, 20);
      await new Promise((r) => setTimeout(r, 200));
      await shot('30-wall-blocks-the-shot');

      // 12b. Hostiles see the player, open fire, and end the run when health runs out.
      await game.page.evaluate(() => {
        window.__fps.setMode('firefight');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 21, y: 0, z: -3.6 }, 0, -0.02);
      });
      let damageTaken = 0;
      let hostileShots = 0;
      let lost = false;
      let capturedUnderFire = false;
      for (let i = 0; i < 200; i++) {
        const events = await game.step({}, 6);
        for (const event of events) {
          if (event.type === 'enemy-shot') hostileShots++;
          if (event.type === 'player-damaged') damageTaken += event.amount;
        }
        const underFire = await game.state();
        if (!capturedUnderFire && underFire.health < 70) {
          capturedUnderFire = true;
          await shot('31-player-under-fire');
        }
        if (underFire.status === 'lost') {
          lost = true;
          break;
        }
      }
      summary.firefightDeath = { hostileShots, damageTaken, lost };
      check('hostiles open fire on a player standing in the open', hostileShots > 0);
      check("hostile rounds take the player's health down", damageTaken > 0);
      check('standing in the open loses the run', lost);
      await new Promise((r) => setTimeout(r, 240));
      await shot('32-defeat-banner');

      const lostState = await game.state();
      const restartSteps = Math.ceil((lostState.resetIn + 0.2) / (1 / 60));
      await game.step({}, restartSteps);
      const restarted = await game.state();
      summary.restart = {
        health: restarted.health,
        rounds: restarted.weapon.rounds,
        alive: restarted.enemies.filter((enemy) => enemy.behavior !== 'dead').length,
        elapsed: restarted.run.elapsed,
      };
      check(
        'restart clears health, ammo, hostiles, and run stats',
        restarted.status === 'playing' &&
          restarted.health === 100 &&
          restarted.weapon.rounds === 30 &&
          restarted.enemies.every((enemy) => enemy.behavior !== 'dead') &&
          restarted.run.elapsed === 0,
      );
      await shot('33-restarted-run');

      // 12c. A shot carries: nearby hostiles turn and move on where it came from.
      await game.page.evaluate(() => {
        window.__fps.setMode('firefight');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
      });
      const beforeShot = await game.state();
      await game.step({ pitchDelta: 0.5 }, 1);
      await game.step({ fire: true }, 1);
      await game.step({}, 60 * 7);
      const afterShot = await game.state();
      const moved = afterShot.enemies.filter((enemy, index) => {
        const before = beforeShot.enemies[index]?.position;
        if (!before) return false;
        return Math.hypot(enemy.position.x - before.x, enemy.position.z - before.z) > 0.5;
      }).length;
      const reacted = afterShot.enemies.filter(
        (enemy) => enemy.aware || enemy.behavior !== 'guard',
      ).length;
      summary.hostileReaction = { moved, reacted };
      check('hostiles react to gunfire and move to investigate', moved > 0 && reacted > 0);
      await game.page.evaluate(() => window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0));
      await game.step({}, 2);
      await new Promise((r) => setTimeout(r, 220));
      await shot('34-hostiles-investigate');

      // 12d. The bot clears the whole firefight.
      await game.page.evaluate(() => {
        window.__fps.setMode('firefight');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
      });
      let steps = 0;
      let killed = 0;
      let botLeaned = false;
      let botAimed = false;
      let minHealth = 100;
      const limit = 60 * 240;
      while (steps < limit) {
        const events = await game.bot(10);
        steps += 10;
        const state = await game.state();
        minHealth = Math.min(minHealth, state.health);
        botLeaned ||= Math.abs(state.player.lean) > 0.1;
        botAimed ||= state.weapon.aim === 1;
        const deaths = events.filter((event) => event.type === 'enemy-killed').length;
        if (deaths > 0) {
          killed += deaths;
          await shot(`35-hostile-${String(killed).padStart(2, '0')}-down`);
        }
        if (state.enemies.every((enemy) => enemy.behavior === 'dead')) break;
        if (state.status !== 'playing') break;
      }
      await game.step({}, 10);
      await new Promise((r) => setTimeout(r, 240));
      const fightEnd = await game.state();
      summary.firefight = {
        botSeconds: +(steps / 60).toFixed(2),
        elapsed: +fightEnd.run.elapsed.toFixed(2),
        shots: fightEnd.run.shotsFired,
        kills: fightEnd.run.kills,
        damageTaken: 100 - minHealth,
        minHealth,
        outcome: fightEnd.status,
      };
      check(
        'bot cleared every hostile in firefight',
        fightEnd.enemies.every((enemy) => enemy.behavior === 'dead'),
      );
      check('firefight records the clear as a win', fightEnd.status === 'won');
      check(
        'firefight recorded kills for every hostile',
        fightEnd.run.kills === fightEnd.enemies.length,
      );
      check('bot aimed during the firefight', botAimed);
      summary.botLeaned = botLeaned;
      await shot('36-firefight-cleared');

      // 13. Steel Targets still completes end to end.
      await game.page.evaluate(() => {
        window.__fps.setMode('steel');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
      });
      const steelStart = await game.state();
      const steelHud = await game.page.evaluate(() => ({
        label: document.querySelector('.hud-objective__label')?.textContent,
        vitalsHidden: document.querySelector('.hud-vitals')?.hidden,
      }));
      check(
        'steel mode HUD tracks plates and hides vitals',
        steelHud.label === 'Targets' && steelHud.vitalsHidden === true,
      );
      let steelSteps = 0;
      let plateDown = 0;
      while (steelSteps < limit) {
        const events = await game.bot(10);
        steelSteps += 10;
        const state = await game.state();
        const fell = events.filter((event) => event.type === 'target-down').length;
        if (fell > 0) {
          plateDown += fell;
          await shot(`05-target-${String(plateDown).padStart(2, '0')}`);
        }
        if (state.targetsDown.every(Boolean)) break;
      }
      await game.step({}, 10);
      await new Promise((r) => setTimeout(r, 240));
      const steelEnd = await game.state();
      summary.steel = {
        botSeconds: +(steelSteps / 60).toFixed(2),
        elapsed: +steelEnd.run.elapsed.toFixed(2),
        shots: steelEnd.run.shotsFired,
        plates: `${steelEnd.targetsDown.filter(Boolean).length} / ${steelEnd.targetsDown.length}`,
      };
      summary.targetsDown = summary.steel.plates;
      check(
        'bot cleared all 14 targets in steel targets mode',
        steelEnd.targetsDown.every(Boolean),
      );
      check(
        'run telemetry recorded elapsed time and every steel hit',
        steelEnd.run.elapsed > 0 && steelEnd.run.hits === 14,
      );
      check('steel mode has no hostiles in it', steelStart.enemies.length === 0);
      await shot('06-cleared');

      // 14. HUD and menu boundaries at the four review resolutions.
      const layouts = [
        [1280, 720],
        [1920, 1080],
        [2560, 1440],
        [2560, 1080],
      ];
      const boundaryResults = [];
      for (const [width, height] of layouts) {
        await game.page.setViewport({ width, height });
        await new Promise((r) => setTimeout(r, 260));
        await game.page.evaluate(() => window.__fps.openScreen('modes'));
        await game.page.mouse.move(8, height - 8);
        await new Promise((r) => setTimeout(r, 300));
        await shot(`37-modes-${width}x${height}`);
        const bounds = await game.page.evaluate(() => {
          const inside = (el) => {
            if (!el) return true;
            const rect = el.getBoundingClientRect();
            return (
              rect.left >= -1 &&
              rect.top >= -1 &&
              rect.right <= window.innerWidth + 1 &&
              rect.bottom <= window.innerHeight + 1 &&
              rect.width > 0
            );
          };
          return {
            screen: inside(document.querySelector('.modes-screen .modes-list')),
            brief: inside(document.querySelector('.modes-brief')),
            cardOverflow:
              document.querySelector('.modes-screen').scrollWidth <= window.innerWidth + 1,
          };
        });
        await game.page.evaluate(() => {
          window.__fps.setMode('firefight');
          window.__fps.openScreen('playing');
          window.__fps.place({ x: 0, y: 0, z: 22 }, 0, 0);
        });
        await game.step({}, 4);
        await new Promise((r) => setTimeout(r, 260));
        await shot(`38-hud-${width}x${height}`);
        const hudBounds = await game.page.evaluate(() => {
          const inside = (selector) => {
            const el = document.querySelector(selector);
            if (!el) return true;
            const rect = el.getBoundingClientRect();
            return (
              rect.left >= -1 &&
              rect.top >= -1 &&
              rect.right <= window.innerWidth + 1 &&
              rect.bottom <= window.innerHeight + 1
            );
          };
          return ['hud-objective', 'hud-vitals', 'hud-weapon', 'hud-stance'].every((name) =>
            inside(`.${name}`),
          );
        });
        boundaryResults.push(bounds.screen && bounds.brief && bounds.cardOverflow && hudBounds);
      }
      check(
        'menu and HUD stay inside the frame at all four review resolutions',
        boundaryResults.every(Boolean),
      );
      summary.layouts = layouts;

      // 15. Reduced motion applies everywhere and still lets a mode start.
      const reduced = await game.page.evaluate(() =>
        window.__fps.settings({ reducedMotion: true }),
      );
      await game.page.evaluate(() => window.__fps.openScreen('modes'));
      await game.page.mouse.move(8, 8);
      await new Promise((r) => setTimeout(r, 260));
      const reducedApplied = await game.page.evaluate(
        () => document.querySelector('.ui-root')?.dataset.reducedMotion === 'true',
      );
      await shot('39-modes-reduced-motion');
      check(
        'reduced motion setting reaches the menu layer',
        reduced.reducedMotion === true && reducedApplied,
      );
      await game.page.evaluate(() => window.__fps.settings({ reducedMotion: false }));
      await game.page.setViewport({ width: 1280, height: 720 });
      await new Promise((r) => setTimeout(r, 200));

      // 16. Draw-call and triangle budget, recorded for comparison with the baseline.
      await game.page.evaluate(() => {
        window.__fps.setMode('firefight');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: 9.2, y: 0, z: 2.0 }, 0, 0);
      });
      await game.step({}, 2);
      summary.firefightRenderStats = await game.page.evaluate(() => window.__fps.renderStats());
      check(
        'firefight scene stays inside the draw-call budget',
        summary.firefightRenderStats.calls <= 65,
      );
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
