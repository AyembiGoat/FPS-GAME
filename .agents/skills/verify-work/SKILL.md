---
name: verify-work
description: How to check a change before calling it done. Use at the end of every task, when a check fails, or when deciding what kind of test a change needs.
---

# Verify work

## Baseline

```
npm run check
```

All five steps must pass. While iterating, run the single relevant step:
`npm run typecheck`, `npm run lint`, `npm run test`, or
`npx vitest run src/core/player.test.ts` for one file.

## Match the check to the change

| Change                     | Minimum verification                                          |
| -------------------------- | ------------------------------------------------------------- |
| Logic in `src/core`        | New or updated unit test that fails without the change        |
| Tuning constant            | Tests still pass; note the before and after value             |
| Rendering, input, UI, feel | `npm run check`, then look at it running (see below)          |
| New asset                  | Loads in the dev server with no console errors; within budget |
| Dependency, config, CI     | Full `npm run check` from a clean `npm ci`                    |
| Docs only                  | `npm run format:check`                                        |

## Writing tests

- Tests sit beside the code: `src/core/thing.ts` and `src/core/thing.test.ts`.
- Test behaviour through the public function, over many simulated steps where that is
  what matters ("after one second of holding forward, the player has moved 5 m").
- Assert against tuning constants, not copies of their values, so retuning does not
  break unrelated tests.
- Use `toBeCloseTo` for accumulated floating point; `toBe` for exact clamps.
- Fix a logic bug by first writing the test that reproduces it.
- Extend an existing test before adding a new one. Do not test what the types already
  guarantee.
- No sleeps, retries or timeouts. Core takes `dt`; step it as many times as needed.

## When a check fails

1. Read the whole error. Fix the cause in your change.
2. Format failures: run `npm run format`.
3. A boundary error in `src/core` (importing `three`, using `performance`,
   `Math.random`) means the code is in the wrong layer. Move it to `src/game` or pass
   the value in as an argument. Do not disable the rule.
4. Do not weaken or delete a test to make it pass unless the tested behaviour was
   intentionally changed. If so, say that explicitly.

## Looking at it

The checks prove the simulation is correct and the project builds. They do not prove
the game looks or feels right. For visual or feel changes, use the `webapp-testing`
skill to run the dev server in a real browser, take a screenshot and read the console.
Pointer lock does not work in a headless browser, so mouse look cannot be driven that
way. If you could not see it running, say that instead of implying it was verified.
