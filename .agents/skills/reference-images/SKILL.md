---
name: reference-images
description: How to get a reference image before making any visual asset, and how to pick a good one. Use before modelling, texturing or drawing anything the player will see, such as weapons, characters, props, environments and UI art.
---

# Reference images

Nothing visual gets made without a reference image first. A model built from a vague
idea comes out generic; a model built from a specific picture can be checked against
it.

## Where the reference comes from

1. **The owner gave one.** Use it. Do not generate alternatives, restyle it or
   "improve" it. If it is unclear from some angle, ask, or generate extra views that
   match it.
2. **UI, HUD, menus, and typography (`src/game/ui`).** Never generate AI reference
   images for UI—image generators produce garbled text, sci-fi clichés, and muddy
   layouts. Instead, search the web for real screenshots from shipped AAA games,
   save them into gitignored `reference/ui/`, open and inspect every image, and write
   down concrete craft observations (hierarchy, safe margins, surfaces, states, motion)
   in `reference/ui-notes.md` before writing code. Study craft; never copy another
   game's logos, icons, or layout verbatim.
3. **3D models, weapons, props, and materials (when the owner gave none).** Generate
   a reference image following the steps below, every time.

## Generating a reference

1. **Write the brief first.** What the object is, what it is for in the game, its
   real-world size, its materials, and how it fits the art direction in `AGENTS.md`.
   If the art direction is not decided and the owner has not described the look, ask
   before generating.
2. **Generate 3 to 5 candidates.** Separate images, not one image with several
   options in it. Vary something that matters between them (proportions, silhouette,
   material), not just the random seed.
3. **Look at every candidate.** Open each image and judge it against the checklist
   below. Do not pick from the prompts or the file names.
4. **Pick the best one, or none.** If no candidate passes, fix the prompt and generate
   another batch. A weak reference is never accepted because it was the best of a bad
   set.
5. **Tell the owner which one you picked and why**, in a sentence, and show it.
6. **Save the chosen image** as `reference/<asset-name>.png`. Delete the rejects.

## Which image model

Use GPT Image when the tool lets you choose. Do not use Qwen Image. If you cannot
choose the model, or GPT Image is unavailable, use the best mainstream model on offer
and say which one produced the image.

## What a good reference looks like

- One subject, whole, in frame, on a plain neutral background.
- Even, neutral lighting, so the surface colour is not confused with shadow.
- A view that can be modelled from: side-on for weapons, front and side for
  characters, three-quarter for props. Generate matching extra views when one view
  hides too much.
- A silhouette that reads at a glance and at small size.
- It makes physical sense. A gun has a grip, a trigger, somewhere for ammunition and a
  barrel that lines up. Hands have five fingers. Parts connect.
- Consistent with the art direction and with assets already in the game.
- Achievable within the budgets in the `models-and-assets` skill.

## Reject it if

- It shows any `no-slop` default: glow lines, neon trim, purple and cyan lighting,
  lens flare, floating particles.
- It has text, logos, watermarks, borders or a busy background.
- Detail is smeared, melted or noise that only looks like detail.
- Parts are duplicated, fused or missing, or the perspective is inconsistent.
- It copies a recognisable design from another game or a film. Real-world objects,
  including real firearms, are what references should show.
- It is a dramatic "concept art" shot that looks good but cannot be modelled from.

## Building from it

- Keep the reference open and compare as you go: proportions first, then silhouette,
  then materials, then detail.
- When done, put the result next to the reference and look. Where they differ, fix the
  model, not the reference.
- If the result does not hold up beside the reference, it is not finished. Say so.
