// Plays the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  every feature, UI screens, both maps, Gun Game, and Practice
//   npm run playtest -- --quick       spawn screenshot only
//   npm run playtest -- --materials   every texture side by side, nothing else
//   npm run playtest -- --weapon      default weapon four-view (or --weapon=ak47, --weapon=all)
//                                     add --optic=acog to fit a sight (file gets an -acog suffix)
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
  'm16a4',
  'aug-a3',
  'ump45',
  'vector',
  'saiga-12',
  'sks',
  'mini-14',
  'kar98k',
  'mosin-nagant',
  'dp-28',
  'beretta-92fs',
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
  const list = target === 'all' ? ALL_WEAPONS : target.split(',');
  const opticFlag = args.find((a) => a.startsWith('--optic='));
  const optic = opticFlag ? opticFlag.split('=')[1] : null;
  summary.errors = [];
  for (const id of list) {
    const page = await launchGame({ mode: optic ? `weapon=${id}&optic=${optic}` : `weapon=${id}` });
    await page.screenshot(`playtest/weapon-${id}${optic ? `-${optic}` : ''}.png`);
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
      check(
        `armory renders all ${ALL_WEAPONS.length} firearms in All tab`,
        loadoutCardCount === ALL_WEAPONS.length,
      );

      // 2b. Attachments in the armory: fit parts, see the numbers move, see why a part is refused.
      await game.page.evaluate(() => window.__fps.inspectLoadout('m16a4'));
      await new Promise((r) => setTimeout(r, 300));
      const bareMagazine = await game.page.evaluate(
        () => document.querySelectorAll('.loadout-stat__value')[1]?.textContent,
      );
      await game.page.evaluate(() => {
        const click = (slot, id) =>
          document
            .querySelector(`.loadout-attach__row[data-slot="${slot}"] [data-attachment-id="${id}"]`)
            ?.click();
        click('muzzle', 'compensator');
        click('grip', 'vertical-foregrip');
        click('magazine', 'extended-mag');
      });
      await new Promise((r) => setTimeout(r, 200));
      await shot('19-loadout-m16a4-attachments');
      const fittedMagazine = await game.page.evaluate(
        () => document.querySelectorAll('.loadout-stat__value')[1]?.textContent,
      );
      const m16Parts = (await game.page.evaluate(() => window.__fps.loadout())).attachments?.m16a4;
      check(
        'armory fits a compensator, foregrip and extended magazine to the M16A4 and the magazine stat grows',
        m16Parts?.muzzle === 'compensator' &&
          m16Parts?.grip === 'vertical-foregrip' &&
          m16Parts?.magazine === 'extended-mag' &&
          parseInt(fittedMagazine, 10) > parseInt(bareMagazine, 10),
      );

      await game.page.evaluate(() => window.__fps.inspectLoadout('kar98k'));
      await new Promise((r) => setTimeout(r, 300));
      const refused = await game.page.evaluate(() => {
        const pill = document.querySelector('.loadout-attach__pill[data-fits="false"]');
        if (!pill) return null;
        pill.click();
        pill.dispatchEvent(new PointerEvent('pointerenter'));
        return {
          id: pill.dataset.attachmentId,
          reason: document.querySelector('.loadout-attach__reason')?.textContent ?? '',
        };
      });
      await new Promise((r) => setTimeout(r, 150));
      await shot('20-loadout-kar98k-refused-part');
      const karParts =
        (await game.page.evaluate(() => window.__fps.loadout())).attachments?.kar98k ?? {};
      summary.refusedPart = refused;
      check(
        'a part that does not fit the Kar98k is greyed out, explains why, and cannot be fitted',
        Boolean(refused && refused.reason.length > 10) &&
          !Object.values(karParts).includes(refused?.id),
      );

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

      // 5b. New firearms in the hand: hip and aimed, one of each new kind of sight.
      const newGunViews = [
        ['m16a4', 'irons', '21-m16a4'],
        ['aug-a3', 'red-dot', '22-aug-a3'],
        ['vector', 'holo', '23-vector'],
        ['saiga-12', 'irons', '24-saiga-12'],
        ['sks', 'irons', '25-sks'],
        ['kar98k', 'irons', '26-kar98k'],
        ['mosin-nagant', 'pso-1', '27-mosin-pso1'],
        ['mini-14', 'pm2-8x', '28-mini14-8x'],
        ['dp-28', 'irons', '29-dp28'],
      ];
      const zooms = {};
      for (const [id, optic, file] of newGunViews) {
        await game.page.evaluate(
          (weaponId, opticId) => {
            window.__fps.equipWeapon(weaponId, 'primary');
            window.__fps.setOptic(weaponId, opticId);
            window.__fps.place({ x: -1.4, y: 0, z: 8.0 }, 0.1, 0.02);
          },
          id,
          optic,
        );
        await game.step({}, 40);
        await shot(`${file}-hip`);
        await game.step({ aim: true }, 40);
        zooms[id] = +(await game.zoom()).toFixed(2);
        await shot(`${file}-aimed`);
        await game.step({}, 30);
      }
      summary.newGunZoom = zooms;
      check(
        'PSO-1 on the Mosin-Nagant magnifies about 4x and the 8x scope on the Mini-14 about 8x',
        zooms['mosin-nagant'] >= 3.6 &&
          zooms['mosin-nagant'] <= 4.4 &&
          zooms['mini-14'] >= 7.2 &&
          zooms['mini-14'] <= 8.8,
      );

      // Beretta in the secondary slot.
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('beretta-92fs', 'secondary');
      });
      await game.step({}, 40);
      await shot('30-beretta-92fs-hip');
      await game.step({ aim: true }, 30);
      await shot('30-beretta-92fs-aimed');
      await game.step({}, 20);

      // Burst fire: one click of the M16A4 fires exactly three rounds.
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('m16a4', 'primary');
        window.__fps.setAttachment('m16a4', 'magazine', null);
      });
      await game.step({}, 40);
      const burstBefore = (await game.state()).weapon.rounds;
      await game.step({ fire: true }, 1);
      await game.step({}, 40);
      const burstAfter = (await game.state()).weapon.rounds;
      check('one click of the M16A4 fires a three-round burst', burstBefore - burstAfter === 3);

      // A suppressor removes the muzzle flash and marks the shot as suppressed.
      await game.page.evaluate(() => {
        window.__fps.equipWeapon('hk416', 'primary');
        window.__fps.setAttachment('hk416', 'muzzle', 'suppressor');
      });
      await game.step({}, 40);
      const quietShot = (await game.step({ fire: true }, 1)).find((e) => e.type === 'shot');
      check(
        'a suppressed HK416 shot is reported as suppressed with a much smaller muzzle flash',
        Boolean(quietShot && quietShot.suppressed && quietShot.muzzleFlash < 0.5),
      );
      await game.page.evaluate(() => {
        window.__fps.setAttachment('hk416', 'muzzle', null);
        window.__fps.equipWeapon('m1911', 'secondary');
        window.__fps.equipWeapon('hk416', 'primary');
      });
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
      check(
        'picking something up is a quiet handling sound next to a gunshot',
        summary.loudness.lootPickupItem > 0.02 &&
          summary.loudness.lootPickupItem < 0.2 &&
          summary.loudness.lootPickupArmour > 0.02 &&
          summary.loudness.lootPickupArmour < 0.2,
      );

      // 7b. Loot and the survival HUD: start with nothing, pick things up, then use them.
      await game.page.evaluate(() => {
        window.__fps.map('shoot-house');
        window.__fps.mode('gungame');
        window.__fps.openScreen('playing');
      });
      await game.step({}, 4);
      const hudRows = () =>
        game.page.evaluate(() => {
          const shown = (selector) =>
            [...document.querySelectorAll(selector)].filter((el) => el.offsetParent !== null)
              .length;
          const prompt = document.querySelector('.hud-pickup');
          return {
            vitalsShown: shown('.hud-vitals') === 1,
            boost: shown('.hud-boost'),
            armourCells: shown('.hud-armour__cell'),
            kitRows: shown('.hud-kit__row'),
            kitItems: shown('.hud-kit__item'),
            promptOpen: prompt?.dataset.open === 'true',
            promptBlocked: prompt?.dataset.blocked === 'true',
            promptText: prompt?.textContent ?? '',
          };
        });
      const bare = await game.state();
      const bareHud = await hudRows();
      await shot('31-hud-start-nothing-carried');
      check(
        'Gun Game starts with no items and no armour, and the health card shows health only',
        Object.values(bare.consumables).every((n) => n === 0) &&
          bare.playerArmour.vest === 0 &&
          bare.playerArmour.helmet === 0 &&
          bare.lootTaken.length === 13 &&
          bare.lootTaken.every((taken) => !taken) &&
          bareHud.vitalsShown &&
          bareHud.boost === 0 &&
          bareHud.armourCells === 0 &&
          bareHud.kitRows === 0 &&
          !bareHud.promptOpen,
      );

      // Stand 1.5 m south of a loot crate, looking down at it.
      const standAt = async (x, z) => {
        await game.page.evaluate(
          (px, pz) => window.__fps.place({ x: px, y: 0, z: pz }, 0, -0.4),
          x,
          z + 1.5,
        );
        await game.step({}, 3);
      };

      await standAt(11.0, 21.4);
      const bandagePrompt = await hudRows();
      await shot('34-loot-prompt-bandages');
      const takeBandage = await game.step({ interact: true }, 1);
      await game.step({}, 3);
      const withBandage = await game.state();
      const bandageHud = await hudRows();
      check(
        'standing at a crate shows what is on it, and F picks it up',
        bandagePrompt.promptOpen &&
          !bandagePrompt.promptBlocked &&
          /Pick up/i.test(bandagePrompt.promptText) &&
          /Bandage/i.test(bandagePrompt.promptText) &&
          takeBandage.some((e) => e.type === 'loot-taken' && e.index === 0) &&
          withBandage.consumables.bandage === 5 &&
          withBandage.lootTaken[0] === true &&
          !bandageHud.promptOpen &&
          bandageHud.kitRows === 1 &&
          bandageHud.kitItems === 1,
      );

      await standAt(9.6, 13.6);
      await shot('35-loot-prompt-helmet');
      await game.step({ interact: true }, 1);
      await standAt(-0.6, 2.2);
      await game.step({ interact: true }, 1);
      await standAt(-1.2, -11.2);
      await game.step({ interact: true }, 1);
      await standAt(30.4, 20.8);
      await game.step({ interact: true }, 1);
      await game.step({}, 3);
      const kitted = await game.state();
      const kittedHud = await hudRows();
      check(
        'helmet, vest, first aid kit and energy drinks are all picked up from their crates',
        kitted.playerArmour.helmet === 1 &&
          kitted.playerArmour.vest === 1 &&
          kitted.consumables['first-aid'] === 1 &&
          kitted.consumables['energy-drink'] === 2 &&
          kittedHud.armourCells === 2 &&
          kittedHud.kitRows === 2 &&
          kittedHud.kitItems === 3,
      );

      // Armour no better than what is worn is refused, and the prompt says why.
      await game.page.evaluate(() => window.__fps.setVitals({ vest: 3 }));
      await standAt(-25.8, -9.2);
      const refusedPrompt = await hudRows();
      await shot('36-loot-prompt-refused-vest');
      const refusedEvents = await game.step({ interact: true }, 1);
      const afterRefusal = await game.state();
      check(
        'a vest no better than the one worn is refused and stays on its crate',
        refusedPrompt.promptOpen &&
          refusedPrompt.promptBlocked &&
          refusedEvents.some((e) => e.type === 'loot-refused') &&
          afterRefusal.playerArmour.vest === 3 &&
          afterRefusal.lootTaken[7] === false,
      );

      // Use what was picked up. The walk round the crates brings hostiles after the player and
      // a hit cancels an item, so the run starts again with the same kit in hand.
      await game.page.evaluate((consumables) => {
        window.__fps.restart();
        window.__fps.setVitals({ health: 38, consumables, vest: 1, helmet: 1 });
      }, kitted.consumables);
      await game.step({}, 3);
      const kitBefore = (await game.state()).consumables;
      await new Promise((r) => setTimeout(r, 300));
      await shot('37-hud-hurt-with-kit');

      const startEvents = await game.step({ useConsumable: 'first-aid' }, 1);
      await game.step({}, 150);
      await shot('31-hud-using-first-aid');
      const midUse = await game.state();
      check(
        'pressing the first aid key starts a timed use that blocks the weapon and shows progress',
        startEvents.some((e) => e.type === 'consumable-start' && e.id === 'first-aid') &&
          midUse.consumableUse?.id === 'first-aid' &&
          (await game.page.$eval('.hud-use', (el) => el.dataset.open)) === 'true',
      );
      let healEvents = [];
      for (let i = 0; i < 30 && (await game.state()).consumableUse; i++) {
        healEvents = healEvents.concat(await game.step({}, 10));
      }
      const healed = await game.state();
      check(
        'first aid kit finishes, restores health to 75 and uses up one kit',
        healEvents.some((e) => e.type === 'consumable-complete') &&
          Math.round(healed.playerHealth) >= 70 &&
          healed.consumables['first-aid'] === kitBefore['first-aid'] - 1,
      );

      await game.step({ useConsumable: 'energy-drink' }, 1);
      for (let i = 0; i < 40 && (await game.state()).consumableUse; i++) await game.step({}, 10);
      const boosted = await game.state();
      await game.step({}, 4);
      await new Promise((r) => setTimeout(r, 300));
      await shot('32-hud-boost-active');
      check(
        'an energy drink fills the boost meter by about 40',
        boosted.playerBoost >= 35 && boosted.playerBoost <= 41,
      );

      await game.page.evaluate(() => window.__fps.setVitals({ health: 40 }));
      await game.step({ useConsumable: 'bandage' }, 1);
      await game.step({}, 30);
      const cancelEvents = await game.step({ fire: true }, 2);
      const afterCancel = await game.state();
      check(
        'firing cancels a bandage in progress and the bandage is kept',
        cancelEvents.some((e) => e.type === 'consumable-cancel') &&
          afterCancel.consumableUse === null &&
          afterCancel.consumables.bandage === kitBefore.bandage,
      );

      // 7c. Aimed-target health: hurt a hostile, keep the sights on it, read its health.
      const aimedReadout = await game.page.evaluate(() => {
        window.__fps.restart();
        let guard = 0;
        while (guard < 60 * 90 && window.__fps.state().outcome === 'ongoing') {
          const events = window.__fps.bot(4);
          guard += 4;
          const hurt = events.some(
            (e) =>
              e.type === 'entity-damaged' && e.entity.kind === 'enemy' && e.healthRemaining > 0,
          );
          if (!hurt) continue;
          for (let i = 0; i < 40; i++) {
            window.__fps.step({ aim: true }, 1);
            const aimed = window.__fps.state().aimedTarget;
            if (aimed) {
              return {
                health: Math.ceil(aimed.health),
                maxHealth: aimed.maxHealth,
                shown: document.querySelector('.hud-target-health')?.dataset.open,
                text: document.querySelector('.hud-target-health__num')?.textContent,
              };
            }
          }
        }
        return null;
      });
      summary.aimedReadout = aimedReadout;
      await new Promise((r) => setTimeout(r, 300));
      await shot('33-hud-aimed-target-health');
      check(
        'aiming at a hostile the player has hurt shows its remaining health',
        Boolean(
          aimedReadout &&
          aimedReadout.shown === 'true' &&
          Number(aimedReadout.text) === aimedReadout.health &&
          aimedReadout.health < aimedReadout.maxHealth,
        ),
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

      // Draw calls of whole frames (world, shadows, gun in hand) over 40 steps. Most frames skip
      // the shadow pass, so the lowest count is the usual frame and the highest a shadow frame.
      summary.cargoYardRenderStats = await game.page.evaluate(() => {
        const calls = [];
        for (let i = 0; i < 40; i++) {
          window.__fps.step({}, 1);
          calls.push(window.__fps.renderStats().calls);
        }
        return {
          ...window.__fps.renderStats(),
          calls: Math.min(...calls),
          shadowFrameCalls: Math.max(...calls),
        };
      });
      await game.page.evaluate(() => window.__fps.restart());
      check(
        'a Cargo Yard Gun Game frame with ten hostiles and all the loot stays under 260 draw calls',
        summary.cargoYardRenderStats.calls <= 260,
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
      await game.step({}, 3);
      summary.cargoYardPracticeCalls = await game.page.evaluate(
        () => window.__fps.renderStats().calls,
      );
      check(
        'a Cargo Yard Practice frame (no hostiles, no loot) stays under 115 draw calls',
        summary.cargoYardPracticeCalls <= 115,
      );

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
