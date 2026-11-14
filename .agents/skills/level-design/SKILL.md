---
name: level-design
description: How to build and change maps, including layout, scale, collision and spawn points. Use for any work on playable spaces.
---

# Level design

No map format or collision system exists yet. The current scene in `src/game/main.ts`
is a flat placeholder. The first map task must settle those two things; record the
decision here when it is made.

## Constraints for that decision

- Map data that affects gameplay (collision shapes, spawn points, objectives, bounds)
  must be readable by `src/core` as plain data, with no dependency on Three.js.
- Visual geometry and collision geometry are separate. Collision stays simple (boxes,
  convex shapes) even when the visuals are detailed.
- A map is data, not code. Adding a map should not require editing game logic.

## Scale reference

One unit is one metre. Derive sizes from `PLAYER_TUNING` in `src/core/player.ts`
rather than guessing.

| Thing                  | Size                                           |
| ---------------------- | ---------------------------------------------- |
| Eye height             | 1.7 m                                          |
| Doorway                | at least 1.2 m wide, 2.2 m high                |
| Corridor               | at least 2 m wide; 3 m or more for combat      |
| Waist-high cover       | about 1.0 to 1.1 m                             |
| Full cover             | 2 m or more                                    |
| Step the player climbs | decide with the collision system               |
| Jump height            | `jumpSpeed² / (2 × gravity)`, currently 0.84 m |

## Layout principles

- Block out with grey boxes and playtest before any art.
- Every important area has at least two ways in.
- Vary sight-line length so different ranges matter. Break very long sight lines.
- Give each area a distinct landmark so players can orient and call out positions.
- Spawns face into the map, out of sight of other spawns and of objectives.
- Light and contrast should lead the eye toward routes and objectives.

## Verification

Walk the whole map in the dev server. Check that nothing can be fallen out of, stuck
on or seen through, and that every route is traversable at walk speed with the current
jump height. Once collision exists, add tests that spawn points are inside bounds and
not inside solid geometry.
