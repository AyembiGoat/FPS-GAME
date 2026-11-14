# FPS Game

A first-person shooter that runs in the browser, built with TypeScript and Three.js.

**Status: first playable slice.** One small map, Shoot House, with walls you cannot
walk through, an M1911 pistol held in two hands, and ten steel targets that fall when
hit and stand back up once all are down. You can aim down the sights and lean round
corners. Includes a live 3D title screen, pause overlay, persisted settings (sensitivity,
ADS sensitivity, FOV, volume, crosshair colour & size, HUD scale, reduced motion),
controls reference, and full tactical HUD with run telemetry. Single-player. There are
no enemies yet.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the printed URL and select **Play** from the title screen to capture the mouse.

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

Add `?bot` to the URL to watch the bot play.

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
  core/       Game rules: movement, collision, weapon, targets, run stats, bot. Pure and unit tested
  core/maps/  Levels, as data
  game/       Browser shell: rendering, input, audio, UI
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
at any frame rate and can be tested without a screen. Lint rules enforce the boundary.
It is also what will let the same rules run on a server when multiplayer is added.

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

- Enemies
- Real 3D model and texture files in place of the code-built ones
- Ramps, stairs and rotated walls (collision handles upright boxes only)
- Multiplayer
- The CI workflow file, which is written but has to be added by someone with
  permission to push GitHub workflow files
