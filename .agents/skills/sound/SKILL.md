---
name: sound
description: How sound is made and mixed, and how to check loudness without being able to hear. Use when adding or changing any sound.
---

# Sound

All sound is synthesised in `src/game/audio/`. There are no audio files.

| File        | Holds                                                          |
| ----------- | -------------------------------------------------------------- |
| `engine.ts` | The mixing desk: four buses, the outdoor echo, the limiter     |
| `sounds.ts` | One function per sound                                         |
| `index.ts`  | What the game calls, and `measureSounds` for checking loudness |

## Loudness is set by the bus

Each sound goes to a bus. The bus sets how loud that kind of sound is and how much
echo it gets:

| Bus        | For                                                                                  |
| ---------- | ------------------------------------------------------------------------------------ |
| `weapon`   | The gunshot                                                                          |
| `handling` | Reload, dry fire, cloth, spent cases, picking up items. Quiet: heard at arm's length |
| `world`    | Bullet impacts, steel, footsteps, landing                                            |
| `ambience` | Wind                                                                                 |

To make a whole kind of sound louder or quieter, change the bus level in `engine.ts`.
Inside `sounds.ts`, levels only set the balance between the parts of one sound.

## Checking without ears

`npm run playtest` prints `loudness`: the peak of each sound as a fraction of the
gunshot. It fails if the reload is more than a fifth of the gunshot. After changing a
sound, read that table. Handling sounds belong around 0.05 to 0.15; nothing but the
gunshot should be near 1.

That measures level only. Whether a sound is pleasant needs a person: tell the owner.

## Making a sound that does not sound fake

- Hard objects meeting (magazine, slide, dry fire) are a very short click plus short
  rings at unrelated pitches. Use `clack`. A lone sine tone sounds like a toy.
- Soft things (cloth, a boot sole) are noise with a slow start and no pitch.
- Build each sound from two or three layers that start at slightly different times.
- Vary pitch a few percent with `engine.vary` so repeats are not identical.
- Time sounds from the same numbers the animation uses. The reload reads its beats from
  the gun model's `reload` field.
- Distant sounds are delayed by distance / 343 and panned toward where they happened.
