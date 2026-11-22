# Height tiers, room outlines and building order: an engine plan

**Status: a proposal waiting for the user's OK (2026-11-22).** Work is tracked on the [height thread](../threads/height.md). It comes from [making a place](../campaign/making-a-place.md): the courtyard's plans need cliffs, terraces, stairs, a real waterline and shapes other than rectangles. Today the sim is flat throughout: it has wall segments and a 2D nav grid, and no notion of height anywhere. A survey of the code (2026-11-22) found where each piece lives; the file references below come from it.

## In the hands

- **Walking.** A cliff edge or a retaining wall stops you, like a rock wall does now. Stairs and ramps take you up or down a tier. Nothing changes in the controls.
- **High ground.** A shot fired from the higher tier passes over the edge below it. A shot from below hits the cliff face, which gives cover. Beams follow the same rule. The cost: tiers have to read clearly at a glance, so cliff faces and edge lips are drawn strongly.
- **Water and the edge of the world.** The sea and the void outside a room's outline stop you like a cliff. Falling or being knocked off a ledge would be fun with Magicka's pushes, but it's parked: edges are walls both ways for now.
- **Co-op.** A partner on a balcony covers the floor below. That gives a natural role.
- **The camera.** Everything standing on a higher tier is drawn higher up the screen, by height × 14.5 px per metre.

## The plan, in phases

| # | Piece | What changes | Size |
|---|---|---|---|
| 1 | **Tiers in content** | A `Height` IntGrid layer: each value is a tier, and a legend gives each tier's height in metres. Ramp and stair cells are a value that blends two tiers. A `void` terrain value marks outside the outline. `compile.mjs` traces tier boundaries into cliff segments the way `traceRock` traces rock (compile.mjs:50), leaving gaps where a ramp joins the two tiers. `RoomDef` gains the tier rows, which changes `roomHash` | M |
| 2 | **Collision and nav** | Nothing new: cliffs are wall segments, so bodies (`collideWalls`), nav (`rebuildBlocked`) and reachability (`check.mjs`) already respect them. The rectangular clamp (effects.ts:837) stays as a backstop | S |
| 3 | **Shots and height** | A body's tier is looked up from its cell, which adds no state to snapshots. Each cliff segment carries its upper tier. A missile stores the tier it was fired from (one byte in the missile pool). `clipRay` and `wallAt` skip a cliff whose upper tier is at or below the shot's tier | M |
| 4 | **Drawing tiers** | One helper, `zAt(x, y)`, from the room's tier rows. Every place that draws something standing on the ground (bodies, props, effects, lighting, shadows) offsets by it. The ground is painted per tier, with cliff-face strips (Codex rock and masonry textures) on the faces the camera sees (+x and +y) | L |
| 5 | **Buildings in front and behind** | Building art is cut into vertical strips about 16 px wide. Each strip is sorted by the footprint's front edge at that column, which replaces massing's `zIndex = -1e9` (massing.ts:139). Props and bodies then pass correctly behind a building's back and in front of its face | M |
| 6 | **Plan to level** | `tools/place-plans/` writes the LDtk level (Terrain, Height and Ground layers, plus markers for doors, gates and the landmark) straight from a plan spec, so the chosen plan becomes the stage-2 grey-box without being redrawn | M |
| 7 | **The sense lint** | Rules from [making a place](../campaign/making-a-place.md#the-sense-rules) are added to `content:check`, now that it can read tiers, doors and water | S |

Phases 1, 2 and 6 alone give a walkable grey-box with real cliffs, which is enough for the flow stage. Phases 3 to 5 are needed before the beauty stage.

## Risks

- **Room size: a follow-up, not a blocker.** A place laid out square to the screen covers a world box about 1.4 times wider. The three courtyard plans need about 220 to 245 u, and the nav grid is 0.5 u cells for each seat, sized to the largest room (`MAX_CELLS`). That's about 4 times today's largest room. The user (2026-11-22): this is solvable later, since enemies only attack once you're reasonably close; this isn't an RTS. The options:
  - nav only inside a window round the players;
  - a coarse grid for distance and a fine one nearby;
  - nav only in the regions where fights happen.

  Filed as [#17](https://github.com/magnevan/wizard-sim/issues/17).
- **One sort key.** Today everything sorts on its feet's y (`y*128 + k`). Tiers add a height to the drawing but not to the sort, which is right for things standing on a tier. Cliff faces and building strips need care where they meet a lower tier in front.
- **Spells that lie on the floor.** Water, ice and fire surfaces (`w.surf`) and floor discs are per cell, ignoring tiers. A puddle on a ledge stays on the ledge's cells, which is right. Lightning surging along water across a cliff is wrong, but rare.
- **The hash.** Any `RoomDef` change alters `roomHash`. The JS and sim copies must change together, and the mode-hash trails are re-recorded.

## Not in this plan

Jumping, flying, bridges you can walk under, and knockback off ledges. Bridges are walkable strips at their tier: you can't pass under them yet.
