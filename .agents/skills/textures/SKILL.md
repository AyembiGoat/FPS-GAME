---
name: textures
description: How surfaces get their look. One shared library of named surfaces that every wall, floor, prop, gun and glove must use. Use before giving anything a colour, material or texture.
---

# Textures

Every surface in the game comes from one library, `src/game/materials/`. Nothing else
creates a material for a surface. That is what keeps the game looking like one place.

## Using a surface

```ts
import { surfaceMesh } from '../materials';

const wall = surfaceMesh(new THREE.BoxGeometry(4, 2.4, 0.2), 'concrete-wall');
```

`surfaceMesh` maps the texture at its real size, so plywood grain is the same width on
a wall and on a small panel, and neighbouring boxes line up. Model in metres. If you
already have a geometry and a mesh, use `applySurface(geometry, name)` and
`surface(name)`.

The current names are the keys of `RECIPES` in `src/game/materials/recipes.ts`. Map
solids pick theirs through the `SURFACES` table in `src/game/world.ts`.

Do not:

- write `new THREE.MeshStandardMaterial({ color })` for something that is a surface.
  Plain materials are for small parts with no visible texture, such as a screw head.
- draw to a canvas or load an image for a one-off texture.
- scale UVs by hand to make a texture fit.

## Adding a surface

1. Find or make a reference image first (`reference-images` skill).
2. Add a recipe to `recipes.ts` and to the `RECIPES` list at the bottom. A recipe is one
   function that answers, for a point on the surface: what colour, how high, how rough.
   The library turns that into matching colour, normal and roughness textures.
3. Set `tile` to the real size one repeat covers, in metres. Set `relief` to the real
   depth of the surface, in metres. Use the real numbers; a 1.22 m plywood sheet is
   1.22 m.
4. Look at it: `npm run playtest -- --materials` writes `playtest/materials.png` with
   every surface side by side under the game's light. Then look at it in the level.

## What makes a recipe look right

- Colour is the surface under plain white light. No baked shadows or highlights; the
  lighting adds those. Keep it out of pure white and pure black (about 30 to 220).
- Height does the work. Seams, pores, grain and gaps should be in `height`, not only
  darker paint.
- Layer three scales: broad variation across the whole tile, a mid-size feature
  (boards, seams, stains), and fine grain.
- Keep contrast low. Strong blotches repeat visibly across a wall. If you can spot the
  repeat from ten metres, lower the broad variation.
- Patterns finer than about 3 pixels of the texture shimmer when seen from a
  distance. Use noise for fine grain, not a regular weave.
- Only `tools.noise`, `tools.fbm` and `tools.hash`, so the result is the same on every
  run. No `Math.random`.

## Checking

Compare `playtest/materials.png` and a level screenshot before and after
(`npm run playtest -- --keep before`, make the change, run it again, open both).
