# game/content: the maps

The rooms of Wizard Sim are drawn in **[LDtk](https://ldtk.io)** (the free, open-source level editor by Deepnight), except the **courtyard**, whose map is its kit scene (`tools/kit/scenes/court.scene.json`, edited in the 3D map editor; [below](#rooms-from-kit-scenes)). The LDtk project is the master copy of every other map; the game never reads it directly. A build step compiles both into plain data the sim imports (`packages/sim/src/rooms.gen.ts`), and a check refuses maps the game can't use.

## Rooms from kit scenes

Since the port to 3D ([plan, decision 1](../../docs/explorations/2026-11-25-port-3d-plan.md#1-one-map-the-kit-scene-feeds-the-sim)) a kit scene is the one map of its room: the picture and the room the sim walks on both come from it.

```sh
python tools/kit/room.py court          # (from the repo root) writes content/generated/rooms/court.room.json, about 2 s
npm run content:build                   # (from game/) folds it into rooms.gen.ts as the room "court"
npm run content:check
python tools/kit/room_shot.py court     # a picture of the walk grid over the scene: game/shots/port-3d/map/court-walk.png
```

`python tools/kit/compile.py court --room` exports the room after its own compile. Commit the scene, the `.room.json` and `rooms.gen.ts` together. CI never runs Python, so the room file is committed; `content:check` fails while the scene's hash differs from the file's `sceneHash` (a scene saved in the editor without a re-export), and a content test runs the exporter twice and compares it with the committed file where Python and shapely are installed.

- **Units.** 1 sim unit = 1 kit u = 0.6 m. A sim point (x, y) is the scene point (x + ox, y + oy) in u, with `toScene = [ox, oy]` in the file (half the scene's size: the room is centred on the origin). A scene corner (cx, cy) is the scene point (cx × G, cy × G).
- **The room** (`room` in the file, the same `RoomDef` an LDtk level makes): cells of 0.5 u take the terrace whose floor covers their centre. Terraces with `walk: false` (the sea, the woods, rock) are `#`. An edge between two walkable cells is a cliff wall unless the scene walks over it: a kerb (0.3 m or less), `steps`, a seam between two levels at one height, a flight's head and foot. A flight's sides are walls. Every other height edge (wall, parapet, retaining wall, a bare drop) is a wall both ways. Heights are tiers as in LDtk rooms; flights and the treads of steps are stair cells (`/`). Set pieces, vignettes and dressing block with their `kit.json` footprint (`propRock`; `props` is empty: the 3D view draws the scene), except pieces under 0.3 m high, those on a pier's cap, and those in ground nobody walks on; a building's archway is left open (`PASSAGES` in `room.py`: the great hall's).
- **Markers** are scene objects: `{"kind": "marker", "id": "gate-yard", "at": [x, y], "tag"?: "landmark", "name"?: "..."}`, `at` in corners. `start-0` to `start-3` are the four seats' starts; every other id becomes a room marker, with the same id and tag rules as an LDtk Marker. `compile.py` draws nothing for them.
- **Height-ready data** (`height3d` in the file, not in the room or its hash; the sim doesn't read it yet): every cell's surface (a terrace or a flight) and every edge where two surfaces meet at different heights, as runs `[x1, y1, x2, y2, kind, top, hA, hB]`: its kind (wall, parapet, retain, drop, steps, kerb, flight, flight-side), the height of its top (a parapet's rail) and the heights either side. It's what shots over parapets, knock-offs and bridges will need ([height in a 2D sim](../../docs/explorations/2026-11-25-port-3d-plan.md#height-in-a-2d-sim-what-were-committing-to)).
- A scene room takes the place of the LDtk level with the same name: the Court level stays in `world.ldtk` (`tools/place-plans/to_ldtk.py` copies it as a template for new levels) but isn't built, its Ground layer isn't emitted, and the agreement check (`maps/scenes/`) skips the room.

```
content/
  maps/
    world.ldtk             the LDtk project: layer and entity definitions, the list of levels
    world/Sanctum.ldtkl    one file per level ("Save levels to separate files")
    world/Arena.ldtkl
    world/Survive.ldtkl
    world/Tutorial.ldtkl   the tutorial's chamber (its per-beat layouts are still code: sim/src/tutorial-data.ts)
    world/Academy.ldtkl    the mock room for judging art (#academy)
    world/Battery.ldtkl    the opening's first job, an outdoor area (#battery); written by tools/segments/01-opening/battery-level.py
    world/Yard.ldtkl       the opening's drill yard in a corner of the academy (#yard); written from plan D by tools/place-plans/to_ldtk.py yard-d,
                           which also writes its stations' Markers (the spec's MARKERS); yard-level.py is superseded
    world/Terraces.ldtkl   the test room for height tiers (#terraces); written by packages/content/src/terraces-level.mjs
  assets/props/<id>/       the asset registry: meta.json and images, below
  generated/               every raw image bought from an AI tool (its README). Never edited; look here before any call
  generated/rooms/         the rooms exported from kit scenes (tools/kit/room.py), committed: above
packages/content/          the build, the check and the grid CLI (node, no runtime part)
  schema/ldtk-1.5.3.schema.json   LDtk's official JSON schema, pinned (from https://ldtk.io/files/JSON_SCHEMA.json)
```

The pipeline is built and tested against **LDtk 1.5.3** (the current release; `jsonVersion` in the project must say so). Use that version: a newer LDtk may save a format the check doesn't know yet. Then update the schema file and `LDTK_VERSION` in `packages/content/src/ldtk.mjs` on purpose.

## Opening and editing the maps

1. Install LDtk 1.5.3 from [ldtk.io](https://ldtk.io/download/) (or the [GitHub release](https://github.com/deepnight/ldtk/releases/tag/v1.5.3)).
2. **File → Open** `game/content/maps/world.ldtk`. The rooms sit side by side in the world view; double-click one to edit it.
3. Paint, place and move things (below). **Save** (Ctrl+S). Keep the project setting **"Save levels to separate files"** on, so each room stays its own file and diffs stay small.
4. In a terminal, from `game/`:
   ```sh
   npm run content:build    # compile the maps into packages/sim/src/rooms.gen.ts
   npm run content:check    # every check; fix what it lists
   npm run dev              # play it (keys 1-6 switch rooms)
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
| 2 | void | `#101014` | outside the room's outline: it blocks like rock (its outline is traced the same way, and rock against void needs no wall) and is meant to be drawn as nothing, so a room can be any shape, not only a rectangle. Painted cells print as `_`. |

Only values the game understands are defined. Pits, water and the like come when the sim has them (the tutorial's pit is still code).

### Height (IntGrid)

Which tier each cell stands on, one value per cell. Unpainted is tier 0; `t1` to `t61` are tiers 1 to 61; `stair` is a stair or ramp (value 100). The level's **`tierMetres`** field (Level › custom fields) gives each tier's height in metres, tier 0 first: the Terraces' is `[0, 3, 6]`. A tier is a number, not an order, so a sea can be a tier below 0 m.

- **Cliffs.** Every edge between two cells more than 0.5 m apart (`STEP_M` in `packages/content/src/compile.mjs`) becomes a cliff; a smaller step, a kerb or one stair tread, is walked over. A cliff is a rock wall segment, merged into the longest straight runs, so bodies, nav, shots and `content:check`'s reachability stop at it with no rule of their own. No cliff is drawn where either cell is rock or void (their outline is already a wall) or a stair. Tiers at the same height are one floor. So a level written from a plan (`tools/place-plans/to_ldtk.py`) gives every step of a flight its own tier, and the flight walks while its sides are cliffs where they stand above the ground beside them.
- **Stairs** join whatever they touch: a run of stair cells between a terrace and the floor leaves a gap in the cliff exactly as wide as the stair. Its sides are open too, so it plays as a ramp. A run of stair cells that touches only one height is an error.
- **In the room** (`RoomDef.height`): the tier rows (`'0'`-`'9'`, `'a'`-`'z'`, `'A'`-`'Z'` for tiers 0 to 61, `'/'` stair), the metres, and for each cliff its `[upper, lower]` tiers. The cliffs are the last entries of `rock` (`firstCliff(def)` in `sim/src/room.ts`). A level with no Height cells has no `height` at all, so a flat room's hash is what it was before tiers existed.
- **Drawn at height** (`client/src/art/heights.ts`): a tiered room's ground image is lifted cell by cell (14.5 art px a metre), the drops toward the camera filled with flat faces, and bodies, props and people stand at the height under their feet. Rock and building cells carry their top's height, so they stand up as blocks; void is left dark. Its terrain walls aren't drawn as stone, and the room's hand-placed grey boxes (`art/massing.ts`) and painted woods are skipped: its plan is its edge.
- **Not yet:** sorting is still by the feet's ground row, so a body behind a raised terrace draws over its face; lighting, shadows and spell effects lie on the flat ground; shots ignore height. The phases are in `docs/threads/height.md`.

Edit it in LDtk, or as text with `npm run content -- height <level>` and `--write <file|->`.

### Entities

| Entity | Fields | Meaning |
|---|---|---|
| **PlayerStart** | `seat` (0–3) | Where a seat's wizard appears when it joins. Every room needs all four seats. |
| **Dummy** | | A practice dummy standing when the room starts (the Sanctum's three). |
| **Portal** | `x`, `y` (optional, world units) | A spot where an enemy portal can open. The Arena's and Survive's wave directors pick the spots farthest from the wizards; **ties go to the one earlier in the layer's list**, so order matters a little. Leave `x`/`y` empty: they are for spots that aren't on the pixel grid (the Arena's ring was computed, so its spots carry exact values). After moving such a portal in LDtk, clear its `x`/`y`: the check fails while they are more than a pixel from where it stands. A room with no portals borrows the Arena's when the tuning panel starts waves in it. |
| **Altar** | | Survive: where the power-up altars rise between waves. None, or exactly three: left, middle, right in list order. |
| **Rock** | `x1`, `y1`, `x2`, `y2` (world units) | A free rock wall segment, for walls that don't follow the grid (Survive's diagonal funnels, its cut keep corners). The fields are what the game reads; the box LDtk draws only shows roughly where it is (its bounding box). Edit the numbers in the entity's panel. For grid-aligned walls, paint Terrain rock instead. |
| **Prop** | `asset` (an id in `assets/props`), `blocks`, `tag` (optional) | Furniture or decoration. It's drawn at the entity's spot: the middle of its footprint on the ground. If `blocks` is on, its footprint stops bodies and shots like rock (and draws no wall). A `tag` gives it a part in the game, and code finds it by tag, never by its art: the battery's `tower`, `circle`, `stakes` and `well` (`tools/segments/01-opening/battery-level.py` writes them). Without a tag it's scenery. |
| **Marker** | `id`, `tag` (optional) | A named spot for the room's encounter script (`packages/sim/src/encounter.ts`) and code: where a group comes out (`openAtMarkers('gap')` sends a group from every marker tagged `gap`), where a line is said, where something stands. `id` is lower-case letters, digits and dashes, unique in the level across markers and regions. |
| **Region** | `id` | A named rectangle: drag its edges to size it; its id shows in the middle. The script asks "is the party in it?" (`partyIn(w, 'hall')`). Same id rules as Marker. |

**Tags are roles, listed in `content/tags.json`** with what the game does with each. A tag means the same in every room (the room is already the scope, so no `battery-` prefix), which lets shared pieces like `openAtMarkers('gap')` work anywhere. The build fails on a tag that isn't listed, and a test checks that every tag the sim asks for is there, so a typo can't silently find nothing. When one level holds several of the same thing in different places (a streamed chapter), scope by Region, not by renaming the tag. Unique things get an `id`, not a tag.

**Markers and Regions belong to the LDtk file, not to a generator.** Claude places most of them; you can move, resize or add them in LDtk, and the level generators (`tools/segments/01-opening/battery-level.py`, `yard-level.py`) keep every Marker and Region already in the level when they rewrite it (the yard's generator rewrites only the Markers it owns: its stations and its people). `npm run content -- grid <level> --entities` shows them as `M` and `R`.

Static rock (Rock entities, traced outlines and blocking props) is the room's terrain: read-only data with a spatial lookup, not part of a rollback snapshot, and separate from the players' 160 wall slots. So a room **can have as many rock wall segments as it needs**. (A blocking prop takes one wall if its footprint is up to 0.6 u deep, two side by side up to 1 u, and past that a closed outline with rows across the inside.)

## The asset registry

`assets/props/<id>/` is one prop: `meta.json` and its images. The client loads images when a room needs them, as textures; the build reads only the footprint.

```json
{ "id": "banner-red", "kind": "prop", "name": "Red banner", "base": "banner", "footprint": [1.6, 0.2], "lift": 3,
  "sets": { "lean": { "file": "lean.png", "foot": [14, 31], "source": "pixellab + local", "raw": "game/content/generated/pixellab/pl-obj-11.png",
                      "tool": "tools/art-trial/variants.py", "ops": ["palette swap: cloth to #a83030"], "status": "Trial asset: not cleared to ship. PixelLab terms unread." } } }
```

| Field | Meaning |
|---|---|
| `footprint` | `[w, h]` in world units: what blocks. Every set shares it, so the room plays the same in each. |
| `sets` | The art treatments: `lean`, `simple`, `code`. A set needs `file`, `foot` (the image pixel standing on the prop's spot) and `source`; a generated one needs `raw`. |
| `round` | The footprint is a round thing's: a deep one blocks as a 12-sided ring instead of a box. |
| `base` | A variant's original. A set the variant lacks comes from its base. |
| `flat` | Lies on the floor, under everything (a rune circle). |
| `lift` | Hangs this many art px above its spot (a banner on a wall). |
| `shadow` | `false`: no soft ground shadow under it (a long diagonal piece, such as a balustrade, has its own painted shade). |
| `sort` | Sorts this many art px further down the screen than its spot; negative is further back. A low wide base can sort at its back rim, so a body standing round it is in front of it. |

To add a prop: put a folder here (`tools/art-trial/props.py` and `variants.py` write these), place a Prop in LDtk, and build. Art direction, how sets are made and variants: `tools/art-trial/README.md`.

The room's id is the level's name with a lower-case first letter (`Survive` → `survive`). The game's code names `sanctum`, `arena`, `survive`, `tutorial` and `academy`, so don't rename those. A new level becomes a new room in the sim automatically; to play it, add a scenario in `packages/client/src/scenarios.ts`.

## What content:check checks

1. The project and every level file against LDtk's official JSON schema (1.5.3), and the pinned version.
2. References: every layer, entity and field instance has its definition, IntGrid values are defined, level files exist and match the project's list, iids are unique, entity-reference fields (none yet) point at real entities.
3. The rooms compile: known entities only, every painted tier has a height in `tierMetres`, every stair joins two heights, all four seats' starts, three altars or none, at least four portals in the Arena and Survive.
4. Placement: every start, dummy, portal and altar is inside the room, not on painted rock or void and at least 0.7 u from any rock wall or blocking prop, and **reachable on foot from seat 0's start**, as is every Marker whose id starts with `gate-`, on the enemies' pathfinding grid (rock widened as `nav.ts` widens it). Every prop is inside the room.
5. `packages/sim/src/rooms.gen.ts` is what the maps compile to, and each kit scene's room file was exported from its scene as it is now (its `sceneHash`). Scene rooms get checks 3 and 4 too (four starts, placement, every `gate-*` marker reachable from seat 0).
6. The asset registry: every Prop names an asset that exists; every `meta.json` is whole; its images exist and none are left out; a generated image names a raw file that exists.

**The sense lint** (`packages/content/src/sense.mjs`) runs after every check passes and prints warnings, never errors: a door or gate (`door-*`, `gate-*` markers) with no clear walkable approach 3 u long and 1 u wide, a door whose approach is grass or mostly road (it wants a forecourt), water meeting grass or paving at its own height, the void within about a screen (12 u) of walkable ground, and a roof or wall top standing a metre over walkable ground but painted a floor material. The rules and which are checked where: [making a place](../../docs/campaign/making-a-place.md#the-sense-rules).

**Camera markers.** A Marker tagged `landmark` with a prop standing on it is a tall landmark: within about a screen the camera leans up to keep its top in frame. One tagged `vista` is a moment to see the nearest landmark whole: the first time a wizard comes within 4 u (or starts there) in a visit, the camera pulls back to a whole-pixel scale that fits it, holds about 3 s, and returns (`client/src/vista.ts`). `tools/place-plans/to_ldtk.py` places both from a plan.

## The grid CLI (for Claude, and for diffs)

```sh
npm run content -- list                         # each level: size, room hash, rock walls, entity counts
npm run content -- grid survive                 # the Terrain layer as text: '.' floor, '#' rock, row 0 at the top
npm run content -- grid survive --entities      # the same with S starts, D dummies, P portals, A altars, + free rock, O props (a view only)
npm run content -- grid sanctum --write rows.txt   # write text rows back into the level ('-' reads stdin); lines starting // are ignored
npm run content -- height terraces              # the Height layer as text: '0'-'9', 'a'-'z', 'A'-'Z' tier, '/' stair (and --write)
```

A write changes only the level's `intGridCsv`. Then run `content:build` and `content:check`. The printed header lines start with `//`, so a printed grid can be edited and written straight back (not one printed with `--entities`: its marks aren't terrain).

## The room hash

The sim hashes each compiled room (FNV-1a over its data: `ROOM_HASH`, `roomHash` in `sim/src/room.ts`) and all of them together (`CONTENT_HASH`). The lobby sends `CONTENT_HASH` with the build version, and a page with different maps can't join ("That host has different maps"), so two versions of a room never meet in one match and desync. `npm run content -- list` prints each room's hash.

## Not yet

No preview tileset: LDtk shows the Terrain as flat colours and the entities as shapes, not our art. The academy rooms, doors between maps, a map viewer page, autotiling art and the AI art trial are later stages (`docs/explorations/2026-11-06-map-pipeline-stage-1.md`).

## Painting the ground

The **Ground** layer (IntGrid, one cell = 0.5 u) says what the floor looks like: grass, dirt, sand, flagstone, cobble, mud, leaves, gravel, ash, planks, slabs or water. It's the client's alone, so it never reaches `rooms.gen.ts` or the room hash, and painting a room can't desync anyone. A level with no Ground cells keeps the code-drawn floor. `npm run content:build` writes the cells to `packages/client/src/art/grounds.gen.ts`.

Edit it in LDtk, or as text with `npm run content -- ground <level>` and `--write <file|->`. Textures are `content/assets/ground/<name>.png`, cut from the tilesets by `tools/art-import/ground.py`. The painter (`client/src/art/ground.ts`) works through any camera.

**Transitions and variation.** Each material has a layer and an edge style (`MATERIAL_STYLES` in `art/ground.ts`). The higher layer decides the edge: grass and forest floor fray, loose ground breaks into clumps, paving loses whole irregular stones, and water gets a dark bank and a foam line. Variation stacks: alternate tiles (`<material>-2.png` and on, colour-matched to the first, picked by region), a random shift and mirror per block for loose materials, broad light and warm or cool drift, and a scatter of small props per material (`SCATTER` in `art/ground-room.ts`).

## Walls from a building kit

A room can build its straight walls from a kit in `content/assets/kits/<kit>/` (`tools/art-import/kits.py` cuts these from the bought kits): list it in `ROOM_KIT` in `client/src/art/wall-kit.ts`. Pieces repeat exactly along the two directions the map's axis-aligned Rock walls run on screen, and a wall that doesn't end on a whole tile (about 2.1 units) is cropped. Walls on the north and west of the room stand full height; those on the south and east are cut low so they don't hide the room. Walls at other angles, and walls a player raises, stay drawn by `art/walls.ts`.
