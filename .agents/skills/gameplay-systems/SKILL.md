---
name: gameplay-systems
description: How to add or change gameplay such as movement, weapons, damage, enemies and game rules. Use for any work that changes what happens in the simulation.
---

# Gameplay systems

## Where things go

Rules and state go in `src/core`. Presentation of those rules goes in `src/game`.
Ask: "would a headless server need this to decide who won?" If yes, it is core.

| Core                                       | Game                                      |
| ------------------------------------------ | ----------------------------------------- |
| Hit detection, damage, health, ammo counts | Muzzle flash, tracers, hit markers, sound |
| Recoil pattern and spread values           | Camera kick animation, weapon bob         |
| Movement, collision, cooldown timers       | Interpolation, view model, HUD            |

## Shape of a system

Follow `src/core/player.ts`:

```ts
export function stepThing(state: ThingState, input: ThingInput, dt: number): ThingState;
```

- State and input are plain readonly data. Return new state; do not mutate.
- Time comes only from `dt`. Timers are numbers counted down in state.
- Randomness (spread, spawn choice) comes from a seeded RNG passed in.
- Tuning lives in one exported `as const` object per system.
- The simulation runs at a fixed 60 Hz. Never assume a render frame equals a step.

## Events

When the shell needs to react to a moment (shot fired, target hit), return those events
from the step function alongside the new state. The shell plays effects from them.
Core never calls into rendering or audio.

## Feel

Good FPS feel is mostly low latency and consistency:

- Look input is applied to the camera immediately, not delayed to the next step.
- Movement speed is identical in every direction and at every frame rate.
- Inputs pressed slightly early should still count (jump buffering, coyote time) once
  those systems exist. Implement them as timers in core state so they are testable.
- Change one tuning value at a time and record the old and new values.

## Checklist

1. Types and step function in `src/core`, with tests covering the normal case, the
   edges (zero, max, clamp) and determinism.
2. Wiring in `src/game`.
3. `npm run check`, then play it.
