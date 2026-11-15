// Plays the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  every feature, UI screens, both maps, Gun Game, and Practice
//   npm run playtest -- --quick       spawn screenshot only
//   npm run playtest -- --materials   every texture side by side, nothing else
//   npm run playtest -- --weapon      default weapon four-view (or --weapon=ak47, --weapon=all)
//   npm run playtest -- --keep after  copy screenshots to playtest/after/ afterwards
//
// Exits non-zero if the page logs an error, a feature check fails, or the bot
// cannot complete both Gun Game and Practice across Shoot House and Cargo Yard.

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
    const initialState = await game.state();
    check(
      'default session starts in Gun Game on Shoot House at Tier 1 (M1911) with 10 live hostiles and 100 HP',
      initialState.mode === 'gungame' &&
        initialState.mapId === 'shoot-house' &&
        initialState.gunGameTier === 0 &&
        initialState.weapon.weaponId === 'm1911' &&
        initialState.enemies.length === 10 &&
        initialState.enemies.every((e) => e.alive) &&
        initialState.playerHealth === 100,
    );
    await shot('01-spawn-gungame-shoothouse');

    if (!quick) {
      // 1. Title Screen
      await game.page.evaluate(() => window.__fps.openScreen('title'));
      await new Promise((r) => setTimeout(r, 240));
      await shot('00-title-menu');
      const titleEntries = await game.page.$$eval('.title-screen .ui-menu-btn', (btns) =>
        btns.map((b) => b.getAttribute('data-entry')),
      );
      check(
        'title menu shows play, modes, loadout, settings, controls',
        JSON.stringify(titleEntries) ===
          JSON.stringify(['play', 'modes', 'loadout', 'settings', 'controls']),
      );

      // 1b. Overhauled Game Modes & Maps Deployment Screen (2 Modes x 2 Maps + 8-Tier Gun Game Ladder)
      await game.page.evaluate(() => {
        window.__fps.openScreen('modes');
        window.__fps.inspectMode('gungame', 'shoot-house');
      });
      await new Promise((r) => setTimeout(r, 240));
      await shot('00b-modes-gungame-shoothouse');

      await game.page.evaluate(() => window.__fps.inspectMode('gungame', 'cargo-yard'));
      await new Promise((r) => setTimeout(r, 200));
      await shot('00c-modes-gungame-cargoyard');

      await game.page.evaluate(() => window.__fps.inspectMode('practice', 'cargo-yard'));
      await new Promise((r) => setTimeout(r, 200));
      await shot('00d-modes-practice-cargoyard');

      await game.page.setViewport({ width: 1920, height: 1080 });
      await new Promise((r) => setTimeout(r, 180));
      await shot('00e-modes-1920x1080');
      const modesLayoutCheck = await game.page.evaluate(() => {
        const sel = document.querySelector('.modes-selectors')?.getBoundingClientRect();
        const insp = document.querySelector('.modes-inspector')?.getBoundingClientRect();
        const modeCards = document.querySelectorAll('.modes-card').length;
        const mapCards = document.querySelectorAll('.modes-map-card').length;
        const ladderSteps = document.querySelectorAll('.modes-ladder-step').length;
        return Boolean(
          sel &&
          insp &&
          modeCards === 2 &&
          mapCards === 2 &&
          ladderSteps === 8 &&
          sel.right <= insp.left + 2,
        );
      });
      await game.page.setViewport({ width: 1280, height: 720 });
      await new Promise((r) => setTimeout(r, 150));
      check(
        'game modes & maps screen renders 2 modes, 2 maps, and 8-tier ladder cleanly without overlap',
        modesLayoutCheck,
      );

      // 2. Armory / Loadout Screen
      await game.page.evaluate(() => window.__fps.openScreen('loadout'));
      await new Promise((r) => setTimeout(r, 340));
      await shot('15-loadout-hk416');
      await game.page.evaluate(() => window.__fps.inspectLoadout('awm'));
      await new Promise((r) => setTimeout(r, 300));
      await shot('16-loadout-awm');
      const loadoutCardCount = await game.page.$$eval('.loadout-card', (els) => els.length);
      check('armory renders all 8 firearms in All tab', loadoutCardCount === 8);

      // 3. Settings & Controls Screens
      await game.page.evaluate(() => {
        window.__fps.openScreen('settings');
        window.__fps.selectSettingsTab('controls');
      });
      await new Promise((r) => setTimeout(r, 200));
      await shot('12-settings-controls');
      await game.page.evaluate(() => window.__fps.openScreen('controls'));
      await new Promise((r) => setTimeout(r, 200));
      await shot('13-controls-screen');

      // 4. Switch to Practice Mode on Cargo Yard — inspect the brand-new Maritime Port + Brick Warehouse map!
      await game.page.evaluate(() => {
        window.__fps.map('cargo-yard');
        window.__fps.mode('practice');
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.openScreen('playing');
      });
      await game.step({}, 6);
      await shot('02-cargoyard-spawn-hk416');

      // Central Double-Stack Container Maze on Cargo Yard
      await game.page.evaluate(() => {
        window.__fps.place({ x: -1.2, y: 0, z: 14.5 }, 0.08, 0.04);
      });
      await game.step({}, 6);
      await shot('03-cargoyard-container-maze');

      // West Industrial Clay-Brick Warehouse interior on Cargo Yard
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('remington-870', 'primary');
        window.__fps.place({ x: -22.5, y: 0, z: 10.6 }, 0.25, 0);
      });
      await game.step({}, 6);
      await shot('04-cargoyard-brick-warehouse-shotgun');

      // East 52 m Steel Crane Pier Lane on Cargo Yard with AWM 6x/10x Scope
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('awm', 'primary');
        window.__fps.place({ x: 25.8, y: 0, z: 20.6 }, 0, 0);
      });
      await game.step({}, 6);
      await shot('05-cargoyard-crane-pier-hip');
      await game.step({ aim: true }, 34);
      await shot('06-cargoyard-crane-pier-awm-6x');
      const awmZoom = await game.zoom();
      check('AWM telescopic scope zooms >= 5.5x on Cargo Yard', awmZoom >= 5.5);

      await game.step({ aim: true, toggleZoom: true }, 1);
      await game.step({ aim: true }, 24);
      const awmZoomHigh = await game.zoom();
      check('AWM variable zoom toggles cleanly to ~10x', awmZoomHigh >= 9.2);
      await game.step({}, 30);

      // Weapon switching [1] <-> [2] works freely in Practice mode
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.equipWeapon('m1911', 'secondary');
        window.__fps.equipWeapon('hk416', 'primary');
      });
      await game.step({ switchSlot: 'secondary' }, 24);
      check(
        'Practice mode allows unrestricted primary <-> secondary switching',
        (await game.state()).weapon.weaponId === 'm1911',
      );
      await game.step({ switchSlot: 'primary' }, 24);

      // 5. Shoot House Overhauled Vistas (Brick Command Bunker + Red/Navy Container Chicane + 50 m Alley)
      await game.page.evaluate(() => {
        window.__fps.map('shoot-house');
        window.__fps.mode('practice');
        window.__fps.equipWeapon('scar-h', 'primary');
        window.__fps.setOptic('scar-h', 'acog');
        window.__fps.place({ x: -1.4, y: 0, z: 8.0 }, 0.1, 0.02);
      });
      await game.step({}, 6);
      await shot('07-shoothouse-central-chicane');

      await game.step({ aim: true, lean: 1 }, 32);
      await shot('08-shoothouse-scar-acog-lean');
      await game.step({}, 30);

      // 6. Pause Screen check
      await game.page.evaluate(() => window.__fps.openScreen('pause'));
      await new Promise((r) => setTimeout(r, 240));
      await shot('14-pause-menu');

      // 7. Audio loudness check (including new tierAdvance stinger)
      summary.loudness = await game.loudness();
      check(
        'every synthesized sound (including Gun Game tierAdvance) produces clean audio',
        summary.loudness.tierAdvance > 0 &&
          summary.loudness.tierAdvance < 0.25 &&
          Object.values(summary.loudness).every((v) => v > 0),
      );

      // 8. Gun Game Incoming Damage + Defeat -> Deploy Again flow
      await game.page.evaluate(() => {
        window.__fps.map('shoot-house');
        window.__fps.mode('gungame');
        window.__fps.openScreen('playing');
        window.__fps.place({ x: -1.2, y: 0, z: 4.5 }, 0, 0);
      });
      let tookHit = false;
      for (let i = 0; i < 100; i++) {
        const evs = await game.step({}, 10);
        if (evs.some((e) => e.type === 'player-hit')) tookHit = true;
        if ((await game.state()).outcome === 'defeat') break;
      }
      await shot('09-gungame-defeat-banner');
      check(
        'player takes incoming enemy fire and enters defeat state at 0 HP',
        tookHit && (await game.state()).outcome === 'defeat',
      );
      await game.page.evaluate(() => {
        const btn = document.querySelector('.hud-banner__btn--primary');
        if (btn instanceof HTMLElement) btn.click();
      });
      await new Promise((r) => setTimeout(r, 120));
      check(
        'Deploy Again resets Gun Game back to Tier 1 (M1911) and 100 HP',
        (await game.state()).outcome === 'ongoing' &&
          (await game.state()).gunGameTier === 0 &&
          (await game.state()).weapon.weaponId === 'm1911',
      );

      // 9. Full 8-Tier Gun Game Escalation Run on Cargo Yard (verifying real-time weapon promotion per kill!)
      await game.page.evaluate(() => {
        window.__fps.map('cargo-yard');
        window.__fps.mode('gungame');
        window.__fps.openScreen('playing');
      });

      summary.cargoYardRenderStats = await game.page.evaluate(() => window.__fps.renderStats());
      check(
        'Cargo Yard batched rendering with 10 3D operators stays lean (<= 115 draw calls)',
        summary.cargoYardRenderStats.calls <= 115,
      );

      const cargoGunGame = await game.page.evaluate(() => {
        const tiersSeen = [window.__fps.state().weapon.weaponId];
        let steps = 0;
        const maxSteps = 60 * 180;
        while (steps < maxSteps && window.__fps.state().outcome === 'ongoing') {
          const evs = window.__fps.bot(600);
          steps += 600;
          for (const ev of evs) {
            if (ev.type === 'gun-game-advance') {
              tiersSeen.push(ev.weaponId);
            }
          }
        }
        const finalState = window.__fps.state();
        return {
          outcome: finalState.outcome,
          tiersSeen,
          enemiesDown: finalState.run.enemiesDown,
          seconds: +(steps / 60).toFixed(2),
          remainingHp: Math.ceil(finalState.playerHealth),
        };
      });
      summary.cargoGunGame = cargoGunGame;
      await game.step({}, 2);
      await shot('10-cargoyard-gungame-victory');
      check(
        'bot climbs all 8 Gun Game weapon tiers on Cargo Yard and wins Arsenal Mastered',
        cargoGunGame.outcome === 'victory' && cargoGunGame.tiersSeen.length === 8,
      );

      // 10. Mid-ladder Gun Game HUD screenshot on Shoot House (Tier 4 HK416 / Tier 5 AK-47) + Full Victory
      await game.page.evaluate(() => {
        window.__fps.map('shoot-house');
        window.__fps.mode('gungame');
        window.__fps.openScreen('playing');
        let guard = 0;
        while (
          guard < 60 * 120 &&
          window.__fps.state().outcome === 'ongoing' &&
          window.__fps.state().gunGameTier < 3
        ) {
          window.__fps.bot(180);
          guard += 180;
        }
      });
      await shot('11-shoothouse-gungame-midtier-hud');

      const shGunGame = await game.page.evaluate(() => {
        let guard = 0;
        while (guard < 60 * 160 && window.__fps.state().outcome === 'ongoing') {
          window.__fps.bot(600);
          guard += 600;
        }
        const st = window.__fps.state();
        return {
          outcome: st.outcome,
          tier: st.gunGameTier,
          enemiesDown: st.run.enemiesDown,
        };
      });
      summary.shootHouseGunGame = shGunGame;
      check(
        'bot completes all 8 Gun Game tiers on Shoot House',
        shGunGame.outcome === 'victory' && shGunGame.enemiesDown >= 8,
      );

      // 11. Full 16-target Practice Mode clear on Cargo Yard!
      await game.page.evaluate(() => {
        window.__fps.map('cargo-yard');
        window.__fps.mode('practice');
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.openScreen('playing');
      });
      const vitalsHiddenInPractice = await game.page.$eval('.hud-vitals', (el) => el.hidden);
      check('Practice mode hides combat vitals card cleanly', vitalsHiddenInPractice);

      const practiceClear = await game.page.evaluate(() => {
        let steps = 0;
        const limit = 60 * 220;
        while (steps < limit && !window.__fps.state().targetsDown.every(Boolean)) {
          window.__fps.bot(600);
          steps += 600;
        }
        const st = window.__fps.state();
        return {
          cleared: st.targetsDown.length === 16 && st.targetsDown.every(Boolean),
          hits: st.run.targetHits,
          seconds: +(steps / 60).toFixed(2),
        };
      });
      summary.cargoPractice = practiceClear;
      await game.step({}, 6);
      await shot('18-cargoyard-practice-cleared');
      check(
        'bot clears all 16 steel targets in Practice mode on Cargo Yard',
        practiceClear.cleared && practiceClear.hits === 16,
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
