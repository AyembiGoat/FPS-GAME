---
name: weapons
description: How to add a gun so that the arms hold it correctly and it reloads, aims and fires like the others. Use when adding or changing any weapon, the arms, or weapon animation.
---

# Weapons

A gun is two things:

| Part  | Where                   | What it holds                                        |
| ----- | ----------------------- | ---------------------------------------------------- |
| Rules | `src/core/weapon.ts`    | A `WeaponSpec`: magazine size, timings, recoil, zoom |
| Model | `src/game/weapons/*.ts` | A `WeaponModel`: the shape, and where things attach  |

The arms, recoil, sway, slide, muzzle flash, spent cases, aiming and the reload are
shared (`viewmodel.ts`, `arms.ts`). A new gun gets all of them by filling in its
`WeaponModel`. Do not write per-gun animation code.

## Adding a gun

1. Reference images first: a side view and the view from behind (`reference-images`).
2. Add a `WeaponSpec` in `src/core/weapon.ts`. Use the gun's real name and real
   figures.
3. Build the model in `src/game/weapons/<name>.ts`, following `m1911.ts`. Gun space is
   metres, +X right, +Y up, barrel along -Z. Use surfaces from the `textures` skill.
4. Return a `WeaponModel` (`model.ts` documents every field).
5. Register it in `src/game/weapons/index.ts`.
6. Add what the bot needs if the gun behaves differently (see `gameplay-systems`).

## Where the hands go

Each hand is placed on an anchor: an empty object you position on the gun. The arm
then reaches it on its own. An anchor means:

- **position**: the centre of whatever the hand is wrapped round.
- **+Y**: up the grip, toward the thumb.
- **+Z**: toward the wrist, the way the forearm leaves the hand.

| Anchor         | Hand  | Put it                                                                                  |
| -------------- | ----- | --------------------------------------------------------------------------------------- |
| `grip`         | right | Middle of the pistol grip, tilted to match the grip's rake                              |
| `support`      | left  | Where the left hand rests: over the right hand on a pistol, on the handguard of a rifle |
| `magazineHand` | left  | On the magazine, as a **child of the magazine**, so the hand follows it out             |

For a rifle, `support` sits under the handguard: +Y pointing up through the handguard,
+Z pointing back and down toward the shooter's left elbow.

The other anchors: `muzzle` (barrel tip), `ejection` (+X is where cases fly), `sight`
(see `aiming-and-scopes`), plus `magazine`, `magazineTravel`, `slide`, `slideTravel`.
`reload` gives the moment of each reload beat as a fraction of the reload time; the
animation and the sounds both read it, so they stay together.

## Checking it looks held

Run `npm run playtest` and open these in `playtest/`:

- `01-spawn.png`: both hands are closed round the gun, not floating beside it or
  buried in it. No finger passes through the slide or barrel. Both forearms run off
  the bottom of the screen; no arm ends in mid-air.
- `04-reload-a…` to `d…`: the left hand is on the magazine as it leaves, goes out of
  view, comes back with it, and returns to the grip.
- `07-aiming.png`: the hands do not cover the sights or the target.
- `09-lean-left.png`, `10-lean-right.png`: the gun and arms stay attached to the view.

If a hand is wrong, move or rotate the anchor. Do not change `arms.ts` to suit one gun.
