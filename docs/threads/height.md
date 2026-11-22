# Height, outlines and building order in the engine

Status: active · Last touched: 2026-11-22
Record: [the engine plan](../explorations/2026-11-22-height-and-outlines.md) · [making a place](../campaign/making-a-place.md) (why it's needed) · [place plans](../../tools/place-plans/README.md) (the specs it builds from) · the courtyard's plans on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page

## Where it stands

The game is flat throughout: wall segments and a 2D nav grid, with no height anywhere. Buildings are drawn behind everything (`massing.ts`, `zIndex = -1e9`). The courtyard's new plans need cliffs, terraces, stairs, a real waterline and outlines of any shape. Every plan needs the same pieces, so this doesn't wait for the user's pick. The phases and file references are in the engine plan.

## Next

- [ ] Phase 1: tiers in content. A `Height` IntGrid layer with a legend of metres per tier, stair and ramp cells, and a `void` terrain value. `compile.mjs` traces tier edges into cliff segments, leaving gaps at stairs. `RoomDef` gains the tier rows, which changes `roomHash`: re-record the mode hashes.
- [ ] Phase 2: check that collision, nav and `content:check` reachability respect the cliffs. They should, since cliffs are wall segments. Add a test room with two tiers and a stair.
- [ ] Phase 6: `tools/place-plans/` writes an LDtk level from a plan spec (Terrain, Height and Ground layers, plus door, gate and landmark markers). Test it on the courtyard plan the user picks, or on plan D.
- [ ] Phase 4, minimal: `zAt(x, y)`, with bodies and props drawn at their tier's height, and cliff faces as flat-coloured strips. That's enough to walk the grey-box and judge flow.
- [ ] Phase 7: the sense lint in `content:check`.
- [ ] Before any art: phase 3 (shots and height), phase 4 in full (painted cliff faces, effects and lighting at height), phase 5 (buildings sorted by footprint).
Not in this thread: pathfinding over big rooms is [#17](https://github.com/magnevan/wizard-sim/issues/17), a follow-up.

## How to work here

- **Determinism.** Content and sim changes keep the rules in `game/CLAUDE.md`. Any `RoomDef` field changes `roomHash`; re-record with `UPDATE_MODE_HASHES=1 npx vitest run packages/sim/test/mode-hashes.test.ts`.
- **Main stays playable.** Every existing room is flat and keeps working with one tier.
- **Branches.** Work on its own branch, not on the opening's docs branch.

## Done

- 2026-11-22 The engine survey and the plan
