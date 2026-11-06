# The map pipeline, stage 1: the rooms are LDtk maps (2026-11-06)

Stage 1 of the plan in `2026-11-06-campaign-and-content.md`, in the form the user chose (decisions, "Content direction: our pipeline, with LDtk as the user's editor"): the existing rooms are ported into an LDtk project, a build compiles it into the sim, and a check guards it. Nothing a player sees or does changes. What changes is how a room is made: from now on, a room is a map you can open, paint and save, and the game picks it up with one command.

## What the user does in LDtk

1. Install **LDtk 1.5.3** (ldtk.io; it's the current release, and the version the files are pinned to).
2. Open `game/content/maps/world.ldtk`. The four rooms (Sanctum, Arena, Survive, Tutorial) sit side by side.
3. In a room:
   - **Terrain layer:** paint **rock** (grey) on the green floor. A painted area becomes solid rock in the game: its outline turns into walls that block walking, shots and sight, and never break.
   - **Entities layer:** drag **PlayerStart** (one per seat 0–3), **Dummy**, **Portal** (where enemy portals can open), **Altar** (Survive's three), and **Rock** (a free wall segment with exact end points, for walls that don't follow the grid, such as Survive's diagonal funnels).
4. Save, then from `game/`: `npm run content:build`, `npm run content:check`, `npm run dev`. The check names any problem in words ("survive: start 1 at -5.2,0 is 0.00 u from the rock wall ...", "portal 0 can't be reached on foot from seat 0's start").

`game/content/README.md` is the reference: the scale, every value and entity, the checks and the CLI.

**What a co-op partner notices:** nothing yet. Later, two players on different map versions can't join each other (the lobby compares a hash of every room), instead of drifting apart mid-match.

## What was built

```
game/content/
  README.md                 how to open and edit the maps; every Terrain value and entity
  maps/world.ldtk           the LDtk project (definitions, the list of levels)
  maps/world/*.ldtkl        Sanctum, Arena, Survive, Tutorial: one file per level
game/packages/content/      @wizard-sim/content, node only
  src/ldtk.mjs              load/save, LDtk's file layout, pixels <-> world units
  src/compile.mjs           levels -> room definitions; painted rock -> wall segments; the generated module
  src/check.mjs             content:check
  src/grid.mjs, cli.mjs     the grid CLI
  schema/ldtk-1.5.3.schema.json   LDtk's official JSON schema, fetched from ldtk.io and pinned
  test/content.test.ts      the checks pass on the real maps and fail on broken copies; tracing; the CLI; hashes
game/packages/sim/src/
  room.ts                   RoomDef and roomHash
  rooms.gen.ts              generated, committed: every room as plain data
```

- `createWorld` takes the room's size, starts, dummies and static rock from `rooms.gen.ts`; the Arena's wave director takes its portal spots from it, Survive its gates and altars. `ROOM_DIMS`, `SURVIVE_ARENA`, `SURVIVE_ROCK`, `SURVIVE_GATES` and `ALTAR_SPOTS` still exist, as views of the data, so nothing else had to change. `Room` is now "every level in the map", so a new level is a new room for the sim (the menu shows a scenario once one names it).
- The world carries its room's layout (`w.def`, not state, like `w.dims`).
- The lobby's host, join and rejoin messages carry `maps` (the sim's `CONTENT_HASH`); a mismatch is refused like a build mismatch: "That host has different maps (another version of the game)."

**Proof of no change:** the golden hash is still `afcc1d3f` (node and Chrome). Before committing, the old sim (from git) and the new one ran the same bot-played runs side by side, 4000 ticks each, hashing every 1000 ticks: the Sanctum, the Sanctum with tuning-panel waves, the Arena, the Arena at wave 8, Survive, Survive at wave 12, and the tutorial. All 28 hashes matched. Every coordinate also compared bit for bit with the old literals. The before/after screenshots of the three rooms match: the same layout, and at the same tick the same state hash on the debug line (Sanctum `0f972668`, Arena `12a1a166`, Survive `91384800` at tick 240); only cosmetic particles differ, from frame timing.

## The format choices

- **One world unit = 20 LDtk pixels; one Terrain cell = 10 px = 0.5 u**, the sim's `CELL`, so the IntGrid is the same grid as the sim's surfaces and pathfinding. Positions convert with one integer division, `(px − width/2) / 20`, which is correctly rounded, so anything on a 0.05 u grid is exact (−2.6 u comes back as the same double as the literal −2.6). Every hand-placed spot in today's rooms is on that grid.
- **Exact values where the grid can't hold them.** The Arena's 36 portal spots were computed (`−11 + (k + ½)/12 · 22` ...), so those Portals carry optional exact `x`/`y` fields. The check fails if they drift more than a pixel from the entity, so moving one in LDtk can't leave a stale number behind.
- **Free rock as segments with number fields.** Survive's 40 walls include diagonals and walls that overhang the arena's edge by 0.4 u. They are Rock entities with `x1 y1 x2 y2` in world units; LDtk draws each as its bounding box. This is the "free segments where the grid doesn't fit" escape hatch from the plan.
- **Painted rock works from day one.** No ported room has painted rock (their walls are all free segments), but painting it does work: the build traces each painted area's outline into wall segments, merged into the longest straight runs, and leaves out edges on the room's border. So the user can block out a room by painting, now.
- **Only what the sim understands is defined.** One IntGrid value (rock; unpainted is floor) and five entities. Pits, water, doors and triggers get defined when the sim has them, so the editor never offers something that silently does nothing.
- **Entity order matters a little and is kept:** portals tie-break by list order and altars are left, middle, right. LDtk keeps a layer's list in order.
- **The tutorial's chamber is a level** (size and starts), but its nineteen beats' layouts (pits, rocks, gates, stones) stay in `tutorial-data.ts`. They change per beat, which a single map doesn't express; porting them means a level per beat, or a "beat" field on entities. That's a bigger step, best taken with the academy work.
- **A wall budget of 40 per room.** Static rock takes wall slots from the same 160-slot pool as players' walls; Survive already uses 40, leaving 120. The check holds every room to that.
- **The generated module is TypeScript, committed.** Tests and the browser need no build step; `content:check`, which also runs inside `npm run check`, fails while it's stale.
- **The build is plain node `.mjs`, no TypeScript.** Node 22 here can't run the sim's TypeScript directly, so the check keeps its own copies of five sim numbers (cell, wall thickness, wizard radius, nav inflation, altars); a test keeps four of them equal to the sim's (nav's inflation isn't exported).

## Judgment calls (the user can veto any)

1. **Rock walls as number fields, not a line LDtk draws.** LDtk can draw a Point field as a path from the entity, which would show diagonal walls as lines you can drag. But points are whole cells of the layer's grid, and Survive's walls need 0.1 u and run outside the level, which LDtk may clamp or drop on save. Numbers are exact and safe; the cost is that the user edits wall ends in the panel, not by dragging.
2. **Reachability is measured on the enemies' nav grid** (rock widened by 0.7 u), from seat 0's start, 8-way without cutting corners. That's stricter than what a wizard needs, and is the right test for "can enemies from this portal reach us". A target counts as reached if its cell or a neighbour is.
3. **Clearance of 0.7 u** (wall half-thickness plus a wizard's radius) between any spot and any rock wall.
4. **The level name is the room id** (`Survive` → `survive`), so the four existing names are fixed; the check fails if one is missing.
5. **No preview tileset yet (the stretch goal, skipped).** Showing our art in LDtk means baking floor and rock tiles to a PNG and wiring them to the IntGrid values, which only pays once the academy's tileset exists (stage 2). For now the floor is the level's background in our grass green and rock is our rock grey.
6. **Ajv validates against LDtk's draft-07 schema**, and levels files against its `Level` definition (minus the `__header__` LDtk adds to them).
7. **The room hash is in the lobby, not in replays.** Replays don't name their room at all yet (they all run the Sanctum), so a room hash there needs a room field first.

## Open questions, each with a recommendation

1. **Rock walls: number fields, or a drawn line?** Recommendation: keep the numbers until the user has tried painting in LDtk; if the Survive walls feel uneditable, try Point paths in a copy and see what LDtk does with out-of-level points.
2. **Is 40 rock walls a room enough?** Painted rock traces efficiently (a rectangle is four walls), but an academy room with many pillars could hit it. Recommendation: keep 40, and raise `MAX_WALLS` the day a real map needs more (it costs a little memory and snapshot size).
3. **A preview tileset in LDtk:** wanted once the academy stone exists? Recommendation: yes, in stage 2, baked from the same code that draws the game's floor, so LDtk shows the game's look.
4. **Port the tutorial's beats into maps?** Recommendation: not yet; revisit when the tutorial moves into the academy, where each beat could be its own small room.
5. **Room hash in replays:** add a room and its hash to the replay header? Recommendation: yes, when replays first record a room other than the Sanctum (a bug report from Survive, say).
6. **Stage 2's first step:** the academy hub (three or four rooms joined by doors) and the map viewer page. Recommendation: doors first (a Door entity naming its target room and arrival point, checked both ways), then one academy room painted in LDtk by the user and one by Claude, compared in the viewer.

## Next

Stage 2: doors between maps, the first academy rooms, a baked "academy stone" tileset (and the LDtk preview from it), and the map viewer page with ratings in its db.
