# Battle-royale arsenal: guns, sights, attachments, armour and healing

This is the study record and specification for the second arsenal expansion. It follows the
pattern of `arsenal-notes.md`, which covers the original eight guns.

Gun, attachment, armour and healing numbers live in `src/core` (`weapon.ts`, `attachments.ts`,
`damage.ts`, `consumables.ts`) and are game balance, not measurements of the real firearms.
They are not repeated here. This file records what the code cannot: where the shapes came
from, why these guns were picked, and what was deliberately left undone.

## 1. Reference photos

Photos were collected by image search on 2026-11-15 into the gitignored folder
`reference/arsenal/br/` (83 photos), and tiled into one contact sheet per subject in
`reference/arsenal/br/sheets/`. Every sheet was opened and compared with the model's side view.

**The source URLs of these photos were not recorded**, so this table lists the search wording
(which is also the file-name prefix) instead of a link. Anyone repeating the study should save
the URLs alongside the files.

| Subject                          | Sheet file                  | What was taken from the photos                                                                                                                    |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colt M16A4                       | `colt-m16a4.jpg`            | 20-inch barrel, A-frame front sight, railed handguard, removable carry handle, fixed A2 stock.                                                    |
| Steyr AUG A3                     | `steyr-aug-a3-rifle.jpg`    | Bullpup layout, magazine behind the grip, full-hand trigger guard, folding foregrip, top rail in place of the old integral scope.                 |
| Heckler & Koch UMP45             | `heckler-koch.jpg`          | Boxy polymer receiver, straight 25-round magazine, skeleton stock that folds to the right.                                                        |
| KRISS Vector                     | `kriss-vector-gen.jpg`      | Barrel in line with the hand, deep block ahead of the magazine, long stick magazine, flat top rail.                                               |
| Saiga-12                         | `saiga-12-shotgun-side.jpg` | Kalashnikov receiver and stock, thick smooth barrel, wide straight box magazine, side rail for sights.                                            |
| SKS                              | `sks-rifle-7.jpg`           | One-piece wood stock, fixed ten-round magazine under the receiver, folding bayonet, hooded front sight, loaded from a stripper clip.              |
| Ruger Mini-14                    | `ruger-mini-14-ranch.jpg`   | Sporting wood stock, short handguard, blade front sight, 20-round box magazine.                                                                   |
| Mauser Kar98k                    | `mauser.jpg`                | Wood to within a hand of the muzzle, turned-down bolt handle, flush five-round magazine, tangent rear sight.                                      |
| Mosin–Nagant 91/30               | `mosin-nagant-m91.jpg`      | Longer barrel than the Kar98k, magazine box showing ahead of the trigger guard, scope on a plate bolted to the left of the receiver.              |
| Degtyaryov DP-28                 | `degtyaryov.jpg`            | Flat pan magazine on top, flared flash hider, perforated barrel jacket, bipod, wooden butt with no separate pistol grip.                          |
| Beretta 92FS                     | `beretta-92fs-pistol.jpg`   | Open-top slide showing the barrel, rounded trigger guard, spur hammer, slide-mounted safety.                                                      |
| PSO-1 and Schmidt & Bender PM II | `pso-1.jpg`                 | PSO-1: short tube, rubber eyecup, side-rail clamp, chevron reticle with rangefinder curve. PM II: 34 mm tube, tall turrets, large objective bell. |

## 2. Firearms

Eleven guns were added to the eight already in the game, for nineteen in total.

The eight original guns keep their numbers. They gained attachment slots and, where they have
a rail, the two new sights.

### Why these eleven

The aim was one gun for every role the first eight did not cover, each handling differently
from its neighbours rather than being a re-skin:

- **M16A4**: the only burst-fire gun. One click fires three rounds.
- **AUG A3**: the only bullpup; quick to aim, slow to reload.
- **UMP45 and Vector**: a slow, steady SMG and a very fast one, either side of the MP5.
- **Saiga-12**: a magazine-fed semi-automatic shotgun beside the pump gun.
- **SKS and Mini-14**: a new marksman class between the assault rifles and the sniper rifles.
- **Kar98k and Mosin–Nagant**: bolt-action rifles that can be used with open sights.
- **DP-28**: the only machine gun.
- **Beretta 92FS**: a high-capacity pistol beside the two heavy-calibre ones.

### Considered and left out

- **M416, AKM, SCAR-L, M24**: too close to the HK416, AK-47, SCAR-H and AWM already present.
- **Crossbow, grenades, melee weapons, pan**: need arrow and thrown-object flight, which the
  game does not have. Out of scope for this change.
- **Groza, M249, AWM-only ammunition rules**: depend on rare-drop and ammunition-type rules,
  and the game has no loot or ammunition types yet.

## 3. Sights

Two sights were added to the six already present.

| Sight               | Magnification | Picture when aimed                                                                                  |
| ------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| PSO-1 4×24          | 4×            | New overlay: centre chevron, three hold-over chevrons, windage scale, rangefinder curve, warm tint. |
| PM II 3–12×50 at 8× | 8× fixed      | Uses the existing sniper-scope overlay.                                                             |

The PSO-1 reticle layout follows the real sight. The game does not model bullet drop, so the
hold-over chevrons and rangefinder are for appearance only.

## 4. Attachments

Each gun has up to four slots: muzzle, grip, magazine and stock. A slot holds one part. A part
fits only if the gun has that slot **and** the part suits the gun's class. The armoury lists
parts that do not fit, greyed out, with the reason.

Guns without a slot say why: the Kar98k and Mosin–Nagant have fixed magazines, the DP-28 takes
nothing, the AK-47 and MP5 have no rail under the barrel.

Attachments change the numbers only. **The 3D gun models do not yet show fitted parts**: a
suppressed HK416 sounds suppressed and has almost no flash, but no suppressor is drawn on the
barrel.

## 5. Decisions that are not obvious from the code

- **Gun Game still uses the original eight-gun ladder.** The new guns are available in the
  armoury and in Practice. Adding them to the ladder would lengthen every run and is a
  separate balance decision.
- **Enemies still carry the original guns** (HK416, AK-47, SCAR-H, MP5, Remington 870).
- **Nothing is carried at the start of a run.** Vests, helmets and healing and boost items lie
  on crates around each map and are picked up with F (`src/core/loot.ts`; each map lists its
  own in `loot`). Better armour replaces what is worn; armour that is no better is refused.
  Item photos used for the models are in `reference/arsenal/loot/`.
- **Practice has no armour, items or vitals card**, because nothing there can hurt the player.
- **No inventory limits, ammunition types or bullet drop.**
