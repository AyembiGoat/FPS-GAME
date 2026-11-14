# FPS Game

A first-person shooter that runs in the browser, built with TypeScript and Three.js.

**Status: playable single-player, with two game modes.** Shoot House is one compound:
a breach house, a yard and a sniper lane, with walls you cannot walk through.

- **Firefight** — six hostile combatants hold the compound. They see you by sight and by
  the sound of your rifle, take cover, aim, fire in bursts, reload and die when hit. You
  have 100 health that regenerates after five seconds out of contact. Clear every hostile
  to win; if your health reaches zero the run ends.
- **Steel Targets** — the plate course: fourteen AR500 silhouettes to knock down.

Both modes run on the same map, and the run restarts itself a few seconds after it ends.
You can aim down the sights, lean round corners, and swap eight firearms. The shell
includes a live 3D title screen, a Game Modes screen, pause overlay, persisted settings
(sensitivity, ADS sensitivity, FOV, volume, crosshair colour & size, HUD scale, reduced
motion), controls reference, and a HUD with health, objective progress and run telemetry.
Single-player only; the hostiles are computer-controlled opponents.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the printed URL, pick a mode under **Game Modes** (or press Play for the last one
chosen), and click to capture the mouse.

| Input              | Action              |
| ------------------ | ------------------- |
| W A S D            | Move                |
| Mouse              | Look                |
| Left click         | Fire                |
| Right click (hold) | Aim down the sights |
| Q / E (hold)       | Lean left / right   |
| R                  | Reload              |
| Space              | Jump                |
| Left Shift         | Sprint              |
| Esc                | Pause               |

Add `?bot` to the URL to watch the bot play, and `?mode=steel` to open in a specific mode.

## Commands

| Command             | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload                                    |
| `npm run check`     | Typecheck, lint, format check, test and build                           |
| `npm run typecheck` | TypeScript in strict mode                                               |
| `npm run lint`      | ESLint with type-aware rules and architecture checks                    |
| `npm run format`    | Format everything with Prettier                                         |
| `npm run test`      | Run unit tests once (`test:watch` to keep running)                      |
| `npm run build`     | Production build into `dist/`                                           |
| `npm run playtest`  | Play the game in a headless browser and save screenshots to `playtest/` |

`npm run check` is the gate. CI runs the same steps on every pull request
(`.github/workflows/ci.yml`).

## Stack

| Purpose       | Library                           |
| ------------- | --------------------------------- |
| Language      | TypeScript (strict)               |
| Rendering     | Three.js                          |
| Dev and build | Vite                              |
| Tests         | Vitest                            |
| Lint          | ESLint with typescript-eslint     |
| Format        | Prettier                          |
| Playtest      | Puppeteer with a bundled Chromium |

## Structure

```
src/
  core/       Game rules: movement, collision, weapons, hostiles, modes, run stats, bot. Pure and unit tested
  core/maps/  Levels, as data
  game/       Browser shell: rendering, input, audio, UI
  game/hostiles.ts  The instanced hostile figures
  game/ui/         Title, pause, settings, controls, and tactical HUD
  game/materials/  The shared texture library
  game/weapons/    Gun models and the arms that hold them
  game/audio/      Procedural Web Audio synthesis
public/fonts/ Bundled open-licensed UI fonts (Barlow & Barlow Condensed, SIL OFL)
scripts/      Headless-browser playtest
reference/    Reference notes and images the visuals were built from
.agents/      Playbooks (skills) for AI agents, indexed in skills.md
AGENTS.md     Rules and architecture for anyone changing the code
```

The rules in `src/core` know nothing about rendering or the browser. They advance at a
fixed 60 Hz and the renderer interpolates between steps, so the game behaves the same
at any frame rate and can be tested without a screen. Every random value in a run (shot
spread, cover choice) comes from a seed carried in the game state, so the same inputs
always replay the same fight. Lint rules enforce the boundary.

The 3D pistol, arms, world surfaces, and synthesised audio are generated in code at
start-up, while UI typography is served locally from `public/fonts/` with zero CDN
requests.

## Working with AI agents

[`AGENTS.md`](AGENTS.md) holds the rules every agent follows: keep systems simple, no
AI slop, always work from a reference image, verify before committing, and explain the
result to the owner in plain language. `CLAUDE.md` points to it.

[`skills.md`](skills.md) lists the playbooks in `.agents/skills/`. Eleven are written for
this project. Five are vendored: two from Anthropic's skills repository and three from
Theo Browne's tstack. `.claude/skills` is a symbolic link to that folder; on Windows,
enable symlinks in Git (`git config core.symlinks true`) before cloning.

## Not yet done

- Real 3D model and texture files in place of the code-built ones
- Ramps, stairs and rotated walls (collision handles upright boxes only)
- Squads: hostiles fight individually and do not coordinate with each other
- Multiplayer
- The CI workflow file, which is written but has to be added by someone with
  permission to push GitHub workflow files
