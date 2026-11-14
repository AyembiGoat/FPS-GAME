---
name: aiming-and-scopes
description: Checklist for confirming that aiming down sights and zoom work, for one gun or after changing the camera, weapon or input code. Use whenever aim, zoom, sights or scopes are touched.
---

# Aiming and scopes

Holding right mouse brings the sights up and zooms the view. How long it takes, how far
it zooms and how much it steadies recoil are per-gun numbers in the gun's `WeaponSpec`:
`aimTime`, `aimZoom`, `aimRecoilFactor`. `aimZoom` is magnification: 1.3 for pistol
sights, 4 for a 4x scope. Where the eye lines up is the `sight` anchor on the gun's
model, with `aimDistance` setting how far the sight sits from the eye.

## Checklist

Run `npm run playtest`. It checks the first five itself and prints them under `checks`.

1. **Aim reaches fully up.** `state.weapon.aim` is 1 after holding aim for `aimTime`.
2. **The view zooms.** `zoom()` equals the gun's `aimZoom` when fully aimed.
3. **It comes back.** After release, `aim` is 0 and `zoom()` is exactly 1.
4. **Shots work while aimed**, and while aimed and leaning.
5. **The bot aims.** It must aim before it fires, so the bot exercises the feature.

Then open the screenshots and look:

6. **The sights are on the centre of the screen** (`07-aiming.png`). The front sight
   sits in the rear notch, level, at the exact middle: 640, 360 in a 1280 x 720 shot.
   If it is off, the `sight` anchor is in the wrong place or is not level.
7. **The shot lands where the sights point** (`08-aiming-firing.png`). The bullet hole
   or fallen target is at the centre, behind the front sight.
8. **Things look bigger.** Compare `07-aiming.png` with `06…` or `01-spawn.png`: a
   distant object is `aimZoom` times wider.
9. **Nothing blocks the view.** Hands, arms and the gun body are below the sight line.
10. **The crosshair dot is hidden while aimed**, and back afterwards.
11. **No clipping.** The gun does not pass through the camera on the way up or during
    recoil; no part vanishes at the screen edge that should be visible.

By reading the code or tests, when the rules change:

12. Aiming slows walking and prevents sprinting (`player.test.ts`).
13. Recoil is reduced by `aimRecoilFactor` (`weapon.test.ts`).
14. Reloading lowers the sights, and they come back up if aim is still held.
15. Mouse speed is divided by the zoom (`input.ts`), so the same hand movement covers
    the same distance on screen at any magnification.

## For a real scope (high zoom)

Not built yet. When one is added, also check: the view through the lens is zoomed
while the edge of the screen is not, or the scope fills the screen with a plain black
surround; the reticle stays sharp and centred; `aimTime` is longer than for iron
sights; and the bot holds fire until fully aimed.

## What a script cannot tell you

Whether aiming feels quick enough and whether the mouse speed feels right while
zoomed. Say so to the owner.
