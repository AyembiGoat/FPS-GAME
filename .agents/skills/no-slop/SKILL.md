---
name: no-slop
description: The defaults AI models fall back on that make work look generated, and what to do instead. Use before finishing any change to UI, HUD, visual effects, game content, code or written text, and when reviewing someone else's change.
---

# No slop

Slop is what you get when nothing was decided and the most common answer was used.
None of the items below is forbidden for ever. Each is banned as a default. Use one only
when you can say what it does for the player or the reader, and the owner's art
direction allows it.

## The test

For every element you added, answer: what does this tell the player, or what breaks if
I remove it? If the honest answer is "it looks cooler" or "nothing", remove it.

## UI and HUD

The UI uses a grounded tactical design system (`reference/ui-notes.md`): layered dark
gunmetal surfaces, `1px` machined hairlines, locally bundled condensed + grotesk type
with tabular numerals, custom SVG icons on a shared grid, one warm brass accent used
sparingly, and responsive deceleration motion. What separates crafted game UI from AI
slop is restraint and real state:

| Slop default                                                           | Crafted UI rule                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Neon borders, permanent bloom, purple-to-cyan gradients, gradient text | Neutral gunmetal palette (`tokens.css`) + one primary accent (`--ui-accent`)   |
| Heavy `backdrop-filter` blur on every HUD box                          | Feathered dark gradients on per-frame HUD; blur only once on modal backdrops   |
| Sci-fi hex grids, meaningless radar rings, fake telemetry readouts     | Crisp `1px` hairlines and corner ticks that frame real game state              |
| Emoji as icons, or mismatched icon stroke weights                      | Custom inline SVGs on one grid (`20x20`) and stroke weight (`1.6px`)           |
| Infinite pulsing, breathing, or floating idle loops                    | Fast ease-out transitions (`120–340ms`) triggered by real events or focus      |
| Motion that ignores accessibility or triggers layout reflows           | Animate `transform` and `opacity` only; collapse movement under Reduced Motion |
| Native browser `<input type="range">` or `<select>` dumped in a modal  | Custom sliders, segmented pills, swatches, and drawn keycaps with keyboard nav |
| Jittering proportional digits in timers, ammo counts, and sliders      | `font-variant-numeric: tabular-nums` on every live number                      |

A HUD is read in a fraction of a second during a fight. Keep the central sightline clear,
anchor HUD modules to consistent safe margins, and ensure legibility over both sunlit
concrete/sky and dark shadow.

## Rendering and effects

- Bloom and emissive materials on everything. Light sources may bloom; trim, edges and
  UI may not.
- A post-processing stack added for mood: vignette, chromatic aberration, film grain,
  lens flare, depth of field. Each one costs frame time and hides enemies.
- Screen shake, flashes and slow motion on ordinary events. Reserve them so they mean
  something.
- Particle spam. A hit needs one readable effect that shows where and whether it
  landed.
- Fog and darkness used to hide unfinished geometry.
- Colour grading that makes enemies hard to pick out from the background.

## Game content

- Controls that do nothing: menu entries, settings, buttons or stats with no system
  behind them. If it is on screen, it works.
- Fake numbers: ammo counts, scores or progress bars not driven by real state.
- Invented names: "Apex Gun", "Plasma Rifle", "Viper X", "Neon Arena", "Sector 7",
  "Shadow Ops". Use the name the thing normally has: M1911, AK-47, Shoot House,
  Warehouse. If there is no normal name, describe it plainly and ask the owner.
- Invented lore, taglines, loading tips and flavour text nobody asked for.
- Many shallow variants (ten guns that differ by one number) instead of one that feels
  right.
- Mixed art styles: assets pulled from different sources that do not share scale,
  texel density or material response.

## Code

- Comments that restate the code, or record what you changed (`// now uses the new
helper`). Comments explain a reason the code cannot show.
- An abstraction with one user. An option nobody sets. A parameter that is always the
  same value. A wrapper that only forwards.
- Handling for cases that cannot happen, and fallbacks that hide a real failure.
  `catch` blocks that swallow the error. Let it fail loudly.
- Compatibility shims for code that never shipped. Change the callers.
- A second helper that duplicates an existing one. Search first.
- Names with `new`, `v2`, `enhanced`, `improved`, `simple`, `utils`, `manager`,
  `helper`. Name the thing for what it is.
- Leftovers: `console.log`, commented-out code, unused exports, TODOs with no owner.
- Tests that assert the mock was called, or copy the implementation into the
  assertion.
- Files nobody asked for: summaries, changelogs, plan documents, extra READMEs.
- Reformatting or renaming code the task did not touch.

## Words

Applies to in-game text, PRs, comments, docs and messages to the owner.

- Hype and praise: "powerful", "seamless", "robust", "comprehensive", "blazing fast".
- Exclamation marks, emoji, greetings and sign-offs.
- Restating the request, announcing what you are about to do, summarising what you
  just said.
- Hedging every claim. State what you know; flag the specific thing you do not.
- Three-item lists and tidy closing lines written for rhythm rather than content.

## Before you finish

1. Reread the diff as someone looking for signs that nobody made a decision.
2. Apply the test above to every visual element and every new function, option and
   file.
3. Remove what fails. A smaller change that is all intentional beats a larger one.
