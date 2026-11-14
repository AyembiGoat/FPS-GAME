# FPS Game

A first-person shooter that runs in the browser. TypeScript, Three.js for rendering,
Vite for dev and build, Vitest for tests. The repo is at baseline: a walkable
placeholder scene and the tooling to verify changes. There are no weapons, enemies,
collision, maps or art yet.

This file is the entry point for every AI agent working here. Task playbooks are in
[`.agents/skills/`](skills.md).

## A note from the owner

The goal is the best FPS there is: the best models, maps and gameplay. That is an
ambitious target, and the way to hit it is simple systems that feel obvious, done to a
high standard, one at a time.

- Do not preserve complexity just because it already exists. Do not add machinery
  because it looks impressive. Find the real constraint, then build the smallest thing
  that makes the correct behaviour unsurprising.
- Measure twice, cut once. Then YAGNI: build what was asked for, not what might be
  needed later. Fight scope creep, including your own.
- No slop. If something looks, reads or plays like the default output of an AI, it is
  wrong for this project. See [No slop](#no-slop).

Treat everything below as good defaults rather than hard rules. What the owner asks for
in the moment overrides this file.

## How to talk to the owner

The owner wants to understand what happened without reading code.

- Explain what was done in plain, everyday language, as you would to someone who does
  not program. Say what is different in the game now and anything they need to decide.
- Keep it short. No file paths, no links to files, no command names, no check output,
  no code unless they ask for it.
- Translate, do not omit. "I made sure nothing else broke" replaces a list of commands.
  "I have not seen this running, so I can't promise it looks right" replaces "not
  browser-verified". If something failed, is unfinished or was not tested, say so in
  the same plain words. Simple never means leaving out bad news.
- No praise, hype, emoji or filler. Do not call the work "robust" or "comprehensive".

This applies to chat with the owner. Commit messages, PR descriptions and code comments
are for developers and can be technical.

## Effort

Do your best work every time. Laziness is the most common way agents fail here.

- Finish the whole task. No stubs, no "the rest follows the same pattern", no
  placeholder passed off as done.
- Do not stop at the first thing that runs. Look at the result, compare it with what
  was asked, and redo it when it falls short.
- Read the code and the skill before changing things. Do not guess at what is there.
- Check your own output: run it, open the image, read the diff.
- When something is hard, work the problem. Do not quietly swap in an easier version
  of the task. If you truly cannot do it, say so plainly.
- Effort goes into quality, not size. Trying hard never means adding things nobody
  asked for.

## Autonomy

Finish the job without checking in at each step.

1. Do the work on the current branch.
2. Verify it (see [Verifying](#verifying)).
3. Commit when it passes.
4. Never open a pull request unless the owner asks for one. Never merge.

Stop and ask first only when a wrong guess would be expensive to undo: deleting work,
adding a paid service, choosing the art direction, or a request that can be read two
very different ways.

## No slop

Full list and reasoning: [`no-slop`](.agents/skills/no-slop/SKILL.md). The short
version:

- **Visuals.** No glow lines, neon outlines or bloom as decoration. No purple-to-blue
  gradients, gradient text, glass panels, pulsing or shimmering loops, or sci-fi HUD
  ornaments that carry no information. No emoji as icons. An effect has to tell the
  player something.
- **Game.** No button, stat, menu entry or setting that is not wired to something
  real. No generic names or lore filler. No effect stack (shake, flare, vignette,
  chromatic aberration) added to make a moment feel bigger.
- **Code.** No comments that narrate the code. No abstractions, options or fallbacks
  for cases that do not exist. No swallowed errors. No leftover logs, TODOs or dead
  code. No file or symbol named `new`, `v2`, `enhanced` or `improved`.
- **Words.** No hype, no exclamation marks, no filler, in the game or in the repo.

### Art direction: not decided

The look of the game has not been chosen. Until the owner chooses it and it is written
in this section:

- Do not invent a style. UI is plain: system font, white text, no decoration. Geometry
  is untextured grey-box. The current scene is a placeholder, not a reference.
- Do not add final art, colour palettes, fonts, HUD styling or post-processing.
- If a task needs a visual decision, ask the owner. When the direction is being
  chosen, use the `frontend-design` skill to propose it.

## Reference images

Every visual asset starts from a reference image. Full steps:
[`reference-images`](.agents/skills/reference-images/SKILL.md).

- If the owner provides a reference, use it as given.
- If not, generate 3 to 5 candidates, look at each one, and build from the best. If
  none is good, generate again. Never build from a weak reference.
- Use GPT Image when you can choose the model. Do not use Qwen Image.

## Architecture

```
src/
  core/   Deterministic simulation. Pure TypeScript.
  game/   Browser shell: rendering, input, audio, asset loading.
```

- **`src/core` is pure.** It must not import `three`, touch the DOM, read the clock or
  call `Math.random`. It takes state, input and `dt`, and returns new state. ESLint
  enforces this. It is what makes gameplay unit-testable, replayable and later runnable
  on a server.
- **`src/game` depends on `core`, never the reverse.** It samples input, steps the
  simulation at a fixed 60 Hz, and draws the result.
- **Units:** metres, seconds, radians. Right-handed, Y up. Yaw 0 looks down -Z.
- **Randomness** in core comes from a seeded RNG passed in as an argument.
- **Tuning values** live in exported constant objects such as `PLAYER_TUNING`.

## Taste

- Rules live in core, presentation lives in game. Complexity belongs at the edges;
  the simulation stays small and pure.
- Small pure functions and readonly data over classes with hidden state.
- Do not allocate in per-frame render code. Reuse vectors and objects.
- A dependency has to earn its place. Say why in the PR.
- Keep changes focused. Do not reformat or refactor unrelated code.
- Delete code that is no longer needed in the same change that makes it unneeded.

## Verifying

- Run `npm run check` before you push. It runs typecheck, lint, format check, tests and
  the build. CI runs the same steps on every pull request.
- While iterating, run the one relevant step, or one test file with
  `npx vitest run <file>`.
- If a step fails, fix the cause. Do not disable a rule, skip a test, or add `any` or
  `@ts-ignore` to get to green.
- Test behaviour that can break: movement, damage, timers, collision, parsing, and the
  logic a bug fix changed. Leave out tests for what types already guarantee, trivial
  logic and copy text.
- Extend before you add. If an existing test covers the behaviour, add a case there.
- A logic bug gets a failing test first, then the fix. A purely visual bug gets a
  before and after capture, not a test.
- A test that needs a sleep, a retry or a timeout to pass is wrong. Core takes `dt`,
  so nothing needs to wait on real time.
- The checks cannot see the screen. For anything visual or feel-related, run the game
  in a real browser with the `webapp-testing` skill. If you cannot, tell the owner you
  have not seen it running.

More detail: [`verify-work`](.agents/skills/verify-work/SKILL.md).

## Pull requests

Only when the owner asks for one. Then use the `file-pr` skill, and `babysit-pr` to
watch it (this repo has no review bots, so wait with `--until green`). In short:

- One request is one PR.
- Conventional commit titles in plain language that say why it matters:
  `feat(core): players can no longer walk through walls`.
- Body: the problem in a sentence or two, then how it was fixed. No inventory of
  changed files. End with the model and harness that did the work.
- UI or visual changes include before and after images when you can capture them.
  Attach them to the PR; never commit PR-only screenshots.
- Comments posted on the owner's behalf follow the `leaving-pr-comments` skill.

## Documentation

Most changes need no documentation change. Agents can read the code.

- Write down decisions and their reasons, constraints that span files, and traps that
  are hard to discover from the source. Before adding a paragraph, ask what someone
  would get wrong without it.
- Do not document every feature, narrate control flow, list files or append summaries
  of what a PR did. Types, tests and code already record the implementation.
- A local reason the code cannot show goes in a short comment next to the code.
- When a decision changes, rewrite or remove the old text. Do not append.
- When a change alters how the project is built, update this file or the relevant
  skill in the same PR.

## Plans and work artifacts

- Do not commit implementation plans, research notes, progress logs or scratch files.
  Keep working material outside the repo.
- The merged PR is the record of what was done. Do not keep a second checklist here.
- Do not commit generated output (`dist/`), secrets, or source art files (`.blend`,
  `.psd`). Shipped assets follow the `models-and-assets` skill.
