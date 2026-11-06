# game/content: the maps

The rooms of Wizard Sim are drawn in **[LDtk](https://ldtk.io)** (the free, open-source level editor by Deepnight). The LDtk project is the master copy of every map; the game never reads it directly. A build step compiles it into plain data the sim imports (`packages/sim/src/rooms.gen.ts`), and a check refuses maps the game can't use.

```
content/
  maps/
    world.ldtk             the LDtk project: layer and entity definitions, the list of levels
    world/Sanctum.ldtkl    one file per level ("Save levels to separate files")
    world/Arena.ldtkl
    world/Survive.ldtkl
    world/Tutorial.ldtkl   the tutorial's chamber (its per-beat layouts are still code: sim/src/tutorial-data.ts)
packages/content/          the build, the check and the grid CLI (node, no runtime part)
  schema/ldtk-1.5.3.schema.json   LDtk's official JSON schema, pinned (from https://ldtk.io/files/JSON_SCHEMA.json)
```

The pipeline is built and tested against **LDtk 1.5.3** (the current release; `jsonVersion` in the project must say so). Use that version: a newer LDtk may save a format the check doesn't know yet. Then update the schema file and `LDTK_VERSION` in `packages/content/src/ldtk.mjs` on purpose.

## Opening and editing the maps

1. Install LDtk 1.5.3 from [ldtk.io](https://ldtk.io/download/) (or the [GitHub release](https://github.com/deepnight/ldtk/releases/tag/v1.5.3)).
2. **File → Open** `game/content/maps/world.ldtk`. The four rooms sit side by side in the world view; double-click one to edit it.
3. Paint, place and move things (below). **Save** (Ctrl+S). Keep the project setting **"Save levels to separate files"** on, so each room stays its own file and diffs stay small.
4. In a terminal, from `game/`:
   ```sh
   npm run content:build    # compile the maps into packages/sim/src/rooms.gen.ts
   npm run content:check    # every check; fix what it lists
   npm run dev              # play it (keys 1-4 switch rooms)
   ```
   Commit the `.ldtk`, the changed `.ldtkl` files and `rooms.gen.ts` together. `npm run check` (and so CI) fails while `rooms.gen.ts` is stale.

LDtk rewrites the files in its own layout when it saves. That is fine: the build reads only the data below, and ignores anything LDtk computes for display (auto-tiles, `__` fields it can recompute).

## Scale

**1 world unit = 20 LDtk pixels.** One Terrain cell is 10 px = 0.5 u (the sim's `CELL`, the size of its surface and pathfinding grids). The room's centre is the world origin; y points down in both. The Sanctum is 24 × 16 u (480 × 320 px), Survive 48 × 34 u (960 × 680 px). A room's size must be a whole number of cells.

Entity positions are pixels, so they land on a 0.05 u grid, and are read exactly (a Portal can also carry exact coordinates, below).

## Layers

### Terrain (IntGrid)

What the ground is, one value per cell.

| Value | Name | Colour | In the game |
|---|---|---|---|
| (unpainted) | floor | the level's background, `#3F6443` (the grass of our floor art) | walkable ground |
| 1 | rock | `#74786C` | static rock that never breaks: walls block walking, shots and sight. The build traces the outline of every painted area into wall segments (merged into the longest straight runs; none along the room's edge, which already stops everything). |

Only values the game understands are defined. Pits, water and the like come when the sim has them (the tutorial's pit is still code).

### Entities

| Entity | Fields | Meaning |
|---|---|---|
| **PlayerStart** | `seat` (0–3) | Where a seat's wizard appears when it joins. Every room needs all four seats. |
| **Dummy** | | A practice dummy standing when the room starts (the Sanctum's three). |
| **Portal** | `x`, `y` (optional, world units) | A spot where an enemy portal can open. The Arena's and Survive's wave directors pick the spots farthest from the wizards; **ties go to the one earlier in the layer's list**, so order matters a little. Leave `x`/`y` empty: they are for spots that aren't on the pixel grid (the Arena's ring was computed, so its spots carry exact values). After moving such a portal in LDtk, clear its `x`/`y`: the check fails while they are more than a pixel from where it stands. A room with no portals borrows the Arena's when the tuning panel starts waves in it. |
| **Altar** | | Survive: where the power-up altars rise between waves. None, or exactly three: left, middle, right in list order. |
| **Rock** | `x1`, `y1`, `x2`, `y2` (world units) | A free rock wall segment, for walls that don't follow the grid (Survive's diagonal funnels, its cut keep corners). The fields are what the game reads; the box LDtk draws only shows roughly where it is (its bounding box). Edit the numbers in the entity's panel. For grid-aligned walls, paint Terrain rock instead. |

Static rock shares the 160 wall slots with the players' walls, so **a room may have at most 40 rock wall segments** (Rock entities plus traced outlines). Survive uses exactly 40.

The room's id is the level's name with a lower-case first letter (`Survive` → `survive`). The game's code names `sanctum`, `arena`, `survive` and `tutorial`, so don't rename those. A new level becomes a new room in the sim automatically; to play it, add a scenario in `packages/client/src/scenarios.ts`.

## What content:check checks

1. The project and every level file against LDtk's official JSON schema (1.5.3), and the pinned version.
2. References: every layer, entity and field instance has its definition, IntGrid values are defined, level files exist and match the project's list, iids are unique, entity-reference fields (none yet) point at real entities.
3. The rooms compile: known entities only, all four seats' starts, three altars or none, at least four portals in the Arena and Survive, at most 40 rock walls.
4. Placement: every start, dummy, portal and altar is inside the room, not on painted rock and at least 0.7 u from any rock wall, and **reachable on foot from seat 0's start** on the enemies' pathfinding grid (rock widened as `nav.ts` widens it).
5. `packages/sim/src/rooms.gen.ts` is what the maps compile to.

## The grid CLI (for Claude, and for diffs)

```sh
npm run content -- list                         # each level: size, room hash, rock walls, entity counts
npm run content -- grid survive                 # the Terrain layer as text: '.' floor, '#' rock, row 0 at the top
npm run content -- grid survive --entities      # the same with S starts, D dummies, P portals, A altars, + free rock (a view only)
npm run content -- grid sanctum --write rows.txt   # write text rows back into the level ('-' reads stdin); lines starting // are ignored
```

A write changes only the level's `intGridCsv`. Then run `content:build` and `content:check`. The printed header lines start with `//`, so a printed grid can be edited and written straight back (not one printed with `--entities`: its marks aren't terrain).

## The room hash

The sim hashes each compiled room (FNV-1a over its data: `ROOM_HASH`, `roomHash` in `sim/src/room.ts`) and all of them together (`CONTENT_HASH`). The lobby sends `CONTENT_HASH` with the build version, and a page with different maps can't join ("That host has different maps"), so two versions of a room never meet in one match and desync. `npm run content -- list` prints each room's hash.

## Not yet

No preview tileset: LDtk shows the Terrain as flat colours and the entities as shapes, not our art. The academy rooms, doors between maps, a map viewer page, autotiling art and the AI art trial are later stages (`docs/explorations/2026-11-06-map-pipeline-stage-1.md`).
