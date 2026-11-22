# Height, outlines and building order in the engine

Status: active · Last touched: 2026-11-22
Record: [the engine plan](../explorations/2026-11-22-height-and-outlines.md) · [making a place](../campaign/making-a-place.md) (why it's needed) · [place plans](../../tools/place-plans/README.md) (the specs it builds from) · the courtyard's plans on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page

## Where it stands

Phases 1 and 2 are built on branch `worktree-height-tiers` (2af5ff0, pushed, not merged to main).

**Levels.** LDtk levels can paint height tiers:
- a `Height` IntGrid layer: unpainted is tier 0, then `t1` to `t9`, and `stair`;
- a `tierMetres` level field, giving each tier's height in metres, tier 0 first;
- a `void` terrain value for outside the room's outline, which blocks like rock and prints as `_`.

**Cliffs.** Every edge between two heights becomes a cliff wall, appended at the end of `rock`; `firstCliff(def)` in `sim/src/room.ts` gives the index. Stairs leave gaps, and their open sides play as ramps. Bodies, nav, shots and reachability all stop at cliffs with no new code.

**`RoomDef.height`** holds `metres`, `rows` (`0` to `9`, `/` for a stair) and `cliffs` (`[upper, lower]` per cliff). Only rooms that paint tiers have it, so flat rooms kept their hash, and the golden and mode hashes didn't change.

**Checks and the test room.**
- `content:check` rejects a tier with no height and a stair that touches only one height. Void counts as blocked when placing starts and portals.
- `npm run content -- height <level> [--write <file|->]` prints or writes a level's heights.
- The test room is Terraces (`#terraces`, key 8, written by `content/src/terraces-level.mjs`): a floor, a 3 m terrace up a wide stair, a 6 m balcony up a narrow one, a pillar and a void corner.

**Limits for now.**
- Cliffs render as stone walls, since nothing is drawn at height yet.
- Shots stop at a cliff from either side; the high-ground rule is phase 3.
- Long diagonal outlines in void trace as many 0.5 u steps, so use free Rock entities for those until there's a better tracer.
- Any generator that copies the Academy's layers must size `Height`'s `intGridCsv` too; `battery-level.py` and `yard-level.py` already write it, flat.

Docs: `game/content/README.md` (Height), `docs/current-state.md`, and the room list in the root `CLAUDE.md`.

## Next

- [ ] Phase 6: `tools/place-plans/` writes an LDtk level from a plan spec (Terrain, Height and Ground layers, plus door, gate and landmark markers). Next up, before phase 4. Test it on the chosen courtyard plan, D revision 5 (`plans/court-d.py`). `tools/place-plans/` exists so far only on branch `worktree-opening-route-docs`, so build this phase on top of it.
- [ ] Phase 2's one gap: a sim test of a wizard walking up a stair. `content:check` reachability across both of the test room's stairs already covers the nav side.
- [ ] Phase 4, minimal (after phase 6; the user left the order to Claude and asked for both, 2026-11-22): `zAt(x, y)`, with bodies and props drawn at their tier's height, and cliff faces as flat-coloured strips. That's enough to walk the grey-box and judge flow.
- [ ] Two fixes from the first in-game flow round (2026-11-22): the camera should follow the wizard's drawn position at height, not the unlifted ground point; and the generated court needs the armillary prop on its dais.
- [ ] A camera look-ahead for landmarks (the fourth in-game flow round on the courtyard, 2026-11-22): within about a screen of a tall landmark, bias the framing so the whole of it stays in view. Walking up the screen towards the armillary, it leaves the top of the frame (the briefing, the finale climb).
- [ ] Camera sequences (the user, 2026-11-22): at the courtyard's briefing and finale arrival, a scripted pull-back or pan brings the whole armillary into view, then returns to play. It's triggered from a level marker.
- [ ] From the courtyard's sense round (2026-11-22): curved and diagonal cliff faces drawn as a grid sawtooth (smooth or 45° runs); roofs drawn in a walkable floor material; sense-lint candidates (no void visible from walkable ground, doors in an inside corner or with a road as their approach, an unguarded drop of over 1 m beside a route, roofs in floor materials, walkable regions no route reaches). The court's vista didn't fire on load (2026-11-22).
- [ ] Seams between places (proposed): `content:check` verifies both sides of each seam match. See [the continuous world](../explorations/2026-11-09-continuous-world-todo.md#2026-11-22-the-segment-as-one-map).
- [ ] Phase 7: the sense lint in `content:check`.
- [ ] Before any art: phase 3 (shots and height), phase 4 in full (painted cliff faces, effects and lighting at height), phase 5 (buildings sorted by footprint).

Not in this thread: pathfinding over big rooms is [#17](https://github.com/magnevan/wizard-sim/issues/17), a follow-up.

## How to work here

- **Determinism.** Content and sim changes keep the rules in `game/CLAUDE.md`. Any `RoomDef` field changes `roomHash`; re-record with `UPDATE_MODE_HASHES=1 npx vitest run packages/sim/test/mode-hashes.test.ts`.
- **Main stays playable.** Every existing room is flat and keeps working with one tier.
- **Branches.** Work on its own branch, not on the opening's docs branch.

## Done

- 2026-11-22 The engine survey and the plan
- 2026-11-22 Phases 1 and 2 on `worktree-height-tiers` (2af5ff0): tiers, stairs and void in LDtk; cliffs as walls; the Terraces test room (`#terraces`, key 8)
