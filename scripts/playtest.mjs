// Plays the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest              walk, shoot, reload, then let the bot clear the map
//   npm run playtest -- --quick   spawn screenshot only
//
// Exits non-zero if the page logs an error or the bot cannot clear the map.

import { launchGame } from './browser.mjs';

const quick = process.argv.includes('--quick');
const game = await launchGame();
const shot = (name) => game.screenshot(`playtest/${name}.png`);
const summary = {};

try {
  await shot('01-spawn');

  if (!quick) {
    // A person's first ten seconds: walk forward, fire, reload.
    await game.step({ forward: 1 }, 45);
    await shot('02-walking');
    await game.step({ fire: true }, 2);
    await shot('03-firing');
    await game.step({}, 20);
    await game.step({ reload: true }, 1);
    await game.step({}, 40);
    await shot('04-reloading');
    await game.step({}, 90);

    // Then the bot plays the rest. A screenshot after every target that goes down.
    let steps = 0;
    let down = 0;
    const limit = 60 * 120;
    while (steps < limit) {
      const events = await game.bot(10);
      steps += 10;
      const fell = events.filter((event) => event.type === 'target-down').length;
      if (fell > 0) {
        down += fell;
        await shot(`05-target-${down}`);
      }
      if ((await game.state()).targetsDown.every(Boolean)) break;
    }
    const state = await game.state();
    summary.botSeconds = steps / 60;
    summary.targetsDown = state.targetsDown.filter(Boolean).length;
    summary.targets = state.targetsDown.length;
    summary.cleared = state.targetsDown.every(Boolean);
    await shot('06-cleared');
  }
} finally {
  summary.errors = game.errors;
  await game.close();
}

console.log(JSON.stringify(summary, null, 2));
if (summary.errors.length > 0 || summary.cleared === false) process.exit(1);
