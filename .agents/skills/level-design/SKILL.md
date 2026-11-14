---
name: level-design
description: How to build and change maps, including layout, scale, collision and spawn points. Use for any work on playable spaces.
---

# Level design

A map is one data file in `src/core/maps/`, typed by `src/core/map.ts`: a list of
solid boxes with a surface material, a spawn point, target positions and the walkable
bounds. `shootHouse.ts` is the example. Collision and the rendered level are both built
from that list, so what the player sees is what they collide with.

## Rules

- Every solid is an axis-aligned box. There are no ramps or rotated walls yet; a map
  that needs them means extending `src/core/collision.ts` first.
- Never let two box faces lie in the same plane where both are visible. They flicker.
  Run walls along one axis through the corners and stop the other axis short.
- Crates up to 0.8 m can be jumped onto. Doorways need a header at 2.05 m or higher.
- Leave 1.9 m of clear floor behind each target; it falls backwards.
- Add the map to the bot test in `src/core/game.test.ts`. If the bot cannot clear it,
  some target is unreachable or cannot be seen.

## Scale reference

One unit is one metre. Derive sizes from `PLAYER_TUNING` in `src/core/player.ts`
rather than guessing.

| Thing                  | Size                                       |
| ---------------------- | ------------------------------------------ |
| Eye height             | 1.65 m                                     |
| Doorway                | at least 1.2 m wide, 2.2 m high            |
| Corridor               | at least 2 m wide; 3 m or more for combat  |
| Waist-high cover       | about 1.0 to 1.1 m                         |
| Full cover             | 2 m or more                                |
| Step the player climbs | decide with the collision system           |
| Jump height            | `jumpSpeed² / (2 × gravity)`, about 0.95 m |

## Layout principles

- Block out with grey boxes and playtest before any art.
- Every important area has at least two ways in.
- Vary sight-line length so different ranges matter. Break very long sight lines.
- Give each area a distinct landmark so players can orient and call out positions.
- Spawns face into the map, out of sight of other spawns and of objectives.
- Light and contrast should lead the eye toward routes and objectives.

## Verification

Run `npm run playtest` and look at every screenshot. Then walk the map yourself or
with a scenario script: check that nothing can be fallen out of, stuck on or seen
through.
