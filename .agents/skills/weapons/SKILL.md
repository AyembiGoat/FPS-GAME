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

Each hand closes round a **handhold** you describe on the gun: an anchor, the size of
the part being held, and where the thumb goes. The fingers are bent round a box of
that size, a millimetre off its surface, so they cannot pass through it. The arm then
reaches the hand on its own.

The anchor is an empty object at the centre of the part being held:

- **+Y**: up the grip, toward the thumb.
- **+Z**: toward the wrist, the way the forearm leaves the hand.
- The palm lies on the hand's own side: +X for the right hand, -X for the left.

`size` is the width (X) and depth (Z) of the part, in metres. Measure the model. If
fingers sink into the gun, the size is too small; if they float, it is too large.

| Field          | Hand  | Put it                                                                      |
| -------------- | ----- | --------------------------------------------------------------------------- |
| `grip`         | right | Centre of the pistol grip, tilted to the grip's rake. Thumb `wrapped`       |
| `trigger`      | right | Where the tip of the index finger rests, beside the trigger                 |
| `support`      | left  | Where the left hand rests. Thumb `alongside`                                |
| `magazineHand` | left  | On the magazine, as a **child of the magazine**, so the hand follows it out |

On a pistol the left hand closes over the right hand's fingers, so its handhold is the
grip plus one finger's thickness (`FINGER`) on the front and each side, one finger
lower. `m1911.ts` shows the sums. On a rifle, `support` is the handguard: +Y up through
it, +Z back toward the shooter's left elbow, size the handguard's width and height.

The other anchors: `muzzle` (barrel tip), `ejection` (+X is where cases fly), `sight`
(see `aiming-and-scopes`), plus `magazine`, `magazineTravel`, `slide`, `slideTravel`.
`reload` gives the moment of each reload beat as a fraction of the reload time; the
animation and the sounds both read it, so they stay together.

## Checking it looks held

First run `npm run playtest -- --weapon` and open `playtest/weapon.png`: the gun and
hands from the left, right, front and above. Fingers lie on the surface, none pass
through the gun or the other hand, and the trigger finger reaches the trigger.

Then run `npm run playtest` and open these in `playtest/`:

- `01-spawn.png`: both hands are closed round the gun, not floating beside it or
  buried in it. No finger passes through the slide or barrel. Both forearms run off
  the bottom of the screen; no arm ends in mid-air.
- `04-reload-a…` to `d…`: the left hand is on the magazine as it leaves, goes out of
  view, comes back with it, and returns to the grip.
- `07-aiming.png`: the hands do not cover the sights or the target.
- `09-lean-left.png`, `10-lean-right.png`: the gun and arms stay attached to the view.

If a hand is wrong, fix the handhold: move or rotate the anchor, or correct the size.
Do not change `arms.ts` to suit one gun.
