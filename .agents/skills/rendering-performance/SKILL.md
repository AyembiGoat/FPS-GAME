---
name: rendering-performance
description: How to work on rendering, lighting, materials, effects and frame rate in Three.js. Use when changing how the game looks or when investigating slow frames or load times.
---

# Rendering and performance

## Targets

- 60 fps at 1080p on a mid-range laptop GPU is the floor. Frame time budget 16.6 ms.
- Consistent frame pacing matters more than peak frame rate. A stutter during a fight
  is worse than a lower steady rate.

## Rules for render code (`src/game`)

- Do not allocate in the frame loop. Create `Vector3`, `Quaternion`, `Matrix4` and
  arrays once and reuse them.
- Share geometries and materials between meshes. Use `InstancedMesh` for repeats.
- Dispose of what you remove: `geometry.dispose()`, `material.dispose()`,
  `texture.dispose()`.
- Cap device pixel ratio (currently 2).
- Rendering reads simulation state and interpolates. It never changes it.

## Cost, roughly in order

1. Draw calls. Merge static geometry; instance repeats; keep material count low.
2. Overdraw and transparency. Large transparent quads (smoke, glass) are expensive.
3. Shadows. Each shadow-casting light renders the scene again. Bake static lighting.
4. Post-processing at full resolution.
5. Triangle count, which is usually not the bottleneck until the others are fixed.

## Measuring

Measure before and after; do not optimise on a guess. `renderer.info.render` gives draw
calls and triangles per frame. The browser performance panel gives frame time and
garbage collection pauses. Report the numbers and the scene they were taken in.

## Looks

- Decide on tone mapping and colour space once, globally, and author assets to it.
- Lighting, fog and contrast are gameplay: enemies must read clearly against
  backgrounds at combat distances.
- Effects support readability first (where the shot came from, whether it hit).

## Verification

`npm run check` verifies none of this. Run the dev server, look at the result, and
watch the frame rate while moving through the heaviest part of the scene.
