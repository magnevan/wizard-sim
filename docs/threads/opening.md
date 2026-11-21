# The campaign opening (drill yard and battery)

Status: active · Last touched: 2026-11-17 at ad06e8c
Record: [battery playtest todo](../explorations/2026-11-10-battery-playtest-todo.md) (every round of the user's notes) · [Opening Segment review](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) (source `tools/segments/01-opening/`) · [canon](../campaign/canon.md)

## Where it stands

The drill yard (`#yard`, key 7, beats 2 and 3) and the battery (`#battery`, key 6, beats 4 to 7) are built and merged to main. The battery is a lesson in steps (`BSTEP` in `sim/src/battery.ts`; prompts in `client/src/battery-text.ts`): arrive, drive a defence, the well fails, infusion, through the gate. The well is rebuilt in 3D (`tools/well-3d/`). Levels are written by `tools/segments/01-opening/battery-level.py` and `yard-level.py`: rerun them, then `npm run content:build`.

## Next

- [ ] The yard's size against a wizard and the Academy buildings: it was marked too small (see [work-in-progress](../work-in-progress.md#campaign-opening)).
- [ ] The user's playtest notes on the yard. The review page's round 5 has `r5-yard-prompts`, `r5-yard-etched` and `r5-yard-soldiers`.
- [ ] The rule for etched glyphs.
- [ ] The battery's repair beat: the well's third state (the `repair` animation is cut and waiting) and "press X to stabilize".
- [ ] The quiet beat's sound. Its proposal and prompts are in the playtest todo doc, not signed off yet.

## How to work here

- `npm run check:battery` and `npm run check:yard` drive the rooms and take screenshots (`game/shots/battery/`).
- `?at=<checkpoint>` starts the battery part-way, for example `?at=well-failing`.
- No paid generation without the user's sign-off on the description.

## Done

- 2026-11-10 Defence towers, the battery's layout, driving, the turret's aim and pilot flame
- 2026-11-11 The battery as a lesson (no waves or timers)
- 2026-11-12 Beats 5 to 7: the well's flow, dry, infusion, the gate; feed lines and glyph paths
- 2026-11-13 The well rebuilt in 3D, its fall as a rigid-body sim; the second pass approved
- 2026-11-14 The drill yard (`#yard`)
- 2026-11-17 Merged to main (ad06e8c)
