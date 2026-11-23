# Height, outlines and building order in the engine

Status: active · Last touched: 2026-11-23
Record: [the engine plan](../explorations/2026-11-22-height-and-outlines.md) · [making a place](../campaign/making-a-place.md) (why it's needed) · [place plans](../../tools/place-plans/README.md) (the specs it builds from) · the courtyard's plans on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page

## Where it stands

Phases 1, 2, 4 (minimal), 6 and 7 are on main. Plans now reach the level through the pipeline compiler (`python tools/place-plans/build.py <plan>`: walk report, level, resolved scene, the agreement check), steps 0 to 4 of [the plan-to-3D pipeline](../../tools/pipeline-3d/index.html). The opening's places will be drawn in stylised 3D from the modular kit ([flexible building](../explorations/2026-11-23-flexible-building.md)), so the pixel-art drawing at height (phase 4 in full) is overtaken for them.

**Levels.** LDtk levels can paint height tiers:
- a `Height` IntGrid layer: unpainted is tier 0, then `t1` to `t9`, and `stair`;
- a `tierMetres` level field, giving each tier's height in metres, tier 0 first;
- a `void` terrain value for outside the room's outline, which blocks like rock and prints as `_`.

**Cliffs.** Every edge between two heights becomes a cliff wall, appended at the end of `rock`; `firstCliff(def)` in `sim/src/room.ts` gives the index. Stairs leave gaps, and their open sides play as ramps. Bodies, nav, shots and reachability all stop at cliffs with no new code.

**`RoomDef.height`** holds `metres`, `rows` (`0` to `9`, `/` for a stair) and `cliffs` (`[upper, lower]` per cliff). Only rooms that paint tiers have it, so flat rooms kept their hash, and the golden and mode hashes didn't change.

**Checks and the test room.**
- `content:check` rejects a tier with no height and a stair that touches only one height. Void counts as blocked when placing starts and portals.
- `npm run content -- height <level> [--write <file|->]` prints or writes a level's heights.
- The test room is Terraces (`#terraces`, key 9, written by `content/src/terraces-level.mjs`): a floor, a 3 m terrace up a wide stair, a 6 m balcony up a narrow one, a pillar and a void corner.

**Limits for now.**
- Cliffs render as stone walls, since nothing is drawn at height yet.
- Shots stop at a cliff from either side; the high-ground rule is phase 3.
- Long diagonal outlines in void trace as many 0.5 u steps, so use free Rock entities for those until there's a better tracer.
- Any generator that copies the Academy's layers must size `Height`'s `intGridCsv` too; `battery-level.py` and `yard-level.py` already write it, flat.

Docs: `game/content/README.md` (Height), `docs/current-state.md`, and the room list in the root `CLAUDE.md`.

## Next

- [x] Phase 6: `tools/place-plans/` writes an LDtk level from a plan spec (`to_ldtk.py`, 61e1201). Now done by the pipeline compiler, `build.py` (steps 0 to 4, 2026-11-23).
- [x] Phase 4, minimal: tiered rooms drawn at height (86a08e1); the camera and cursor at the wizard's height and the armillary in the court (74f0755).
- [x] The camera look-ahead for landmarks (2fa2146). Camera vistas were built (4343fff), then taken out of the court (the user: "you'll see enough of it as you walk around"; feabfbb).
- [x] From the courtyard's sense round: diagonal edges drawn straight, dark roofs, five more sense checks (04271ce).
- [x] The handoffs from 2026-11-22: no court vista, the battery's rules, the infirmary's grey-box room, court rev 14 (feabfbb, then the levels on main, a7a87e7).
- [x] Phase 7: the sense lint in `content:check` (`content/src/sense.mjs`, 4343fff). Further sense rules are overtaken by the pipeline's agreement check (step 1: the scene against what the sim walks on) and the kit's validators (`tools/kit/compile.py`), which refuse broken joins before a level exists.
- [ ] Phase 2's one gap: a sim test of a wizard walking up a stair. `content:check` reachability across both of the test room's stairs already covers the nav side.
- [ ] Seams between places (proposed): `content:check` verifies both sides of each seam match. See [the continuous world](../explorations/2026-11-09-continuous-world-todo.md#2026-11-22-the-segment-as-one-map).
- [ ] Phase 3 (shots and height) and phase 5 (buildings sorted by footprint), for the sim. Phase 4 in full (painted cliff faces, effects and lighting at height) only if a pixel room needs it.

Not in this thread: pathfinding over big rooms is [#17](https://github.com/magnevan/wizard-sim/issues/17), a follow-up.

## How to work here

- **Determinism.** Content and sim changes keep the rules in `game/CLAUDE.md`. Any `RoomDef` field changes `roomHash`; re-record with `UPDATE_MODE_HASHES=1 npx vitest run packages/sim/test/mode-hashes.test.ts`.
- **Main stays playable.** Every existing room is flat and keeps working with one tier.
- **Branches.** Work on its own branch, not on the opening's docs branch.

## Done

- 2026-11-22 The engine survey and the plan
- 2026-11-22 Phases 1 and 2 on `worktree-height-tiers` (2af5ff0): tiers, stairs and void in LDtk; cliffs as walls; the Terraces test room (`#terraces`, key 8)
- 2026-11-22 Phases 6, 4 (minimal) and 7, the camera at height, the look-ahead; the plan-made levels on main (a7a87e7)
- 2026-11-23 Plan to level through the pipeline compiler (`build.py`, steps 0 to 4); the sense lint overtaken by the agreement check
