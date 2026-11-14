# FPS Game

A first-person shooter that runs in the browser, built with TypeScript and Three.js.

**Status: baseline.** You can walk, sprint and jump around a placeholder scene. There
are no weapons, enemies, collision, maps or art yet. What is in place is the project
structure, the tooling, and the guidance that lets people and AI agents build on it
and check their work.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the printed URL and click to capture the mouse.

| Input | Action  |
| ----- | ------- |
| WASD  | Move    |
| Mouse | Look    |
| Space | Jump    |
| Shift | Sprint  |
| Esc   | Release |

## Commands

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload                 |
| `npm run check`     | Typecheck, lint, format check, test and build        |
| `npm run typecheck` | TypeScript in strict mode                            |
| `npm run lint`      | ESLint with type-aware rules and architecture checks |
| `npm run format`    | Format everything with Prettier                      |
| `npm run test`      | Run unit tests once (`test:watch` to keep running)   |
| `npm run build`     | Production build into `dist/`                        |

`npm run check` is the gate. CI runs the same steps on every pull request
(`.github/workflows/ci.yml`).

## Stack

| Purpose       | Library                       |
| ------------- | ----------------------------- |
| Language      | TypeScript (strict)           |
| Rendering     | Three.js                      |
| Dev and build | Vite                          |
| Tests         | Vitest                        |
| Lint          | ESLint with typescript-eslint |
| Format        | Prettier                      |

## Structure

```
src/
  core/     Deterministic simulation: pure TypeScript, unit tested
  game/     Browser shell: rendering, input
.agents/    Playbooks (skills) for AI agents, indexed in skills.md
AGENTS.md   Rules and architecture for anyone changing the code
```

The simulation in `src/core` knows nothing about rendering or the browser. It advances
at a fixed 60 Hz and the renderer interpolates between steps, so gameplay behaves the
same at any frame rate and can be tested without a GPU. Lint rules enforce the
boundary.

## Working with AI agents

[`AGENTS.md`](AGENTS.md) holds the rules every agent follows: keep systems simple, no
AI slop, verify before pushing, open a pull request when checks pass, and explain the
result to the owner in plain language. `CLAUDE.md` points to it.

[`skills.md`](skills.md) lists the playbooks in `.agents/skills/`. Six are written for
this project. Five are vendored: two from Anthropic's skills repository and three from
Theo Browne's tstack. `.claude/skills` is a symbolic link to that folder; on Windows,
enable symlinks in Git (`git config core.symlinks true`) before cloning.

## Not yet decided

- Collision and physics (hand-written or a library such as Rapier)
- Map format and editing workflow
- Art direction (agents use plain placeholders until it is chosen) and asset pipeline
- Single-player, multiplayer or both
- Automated browser and visual testing
