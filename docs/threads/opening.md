# The campaign opening (the morning everything breaks)

Status: active · Last touched: 2026-11-21 at 56e581a
Record: [brief and route](../campaign/01-opening/brief.md) · [element order](../explorations/2026-11-16-element-order.md) · [encounters](../explorations/2026-11-16-opening-encounters.md) · [battery playtest todo](../explorations/2026-11-10-battery-playtest-todo.md) · [Opening Segment review](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) (beats 1 to 7, source `tools/segments/01-opening/`) · [The Morning Everything Breaks](https://claude.ai/artifact/9DwUCZHa8ibckf2vWiFews) (the route, source `tools/element-order/`) · [canon](../campaign/canon.md)

## Where it stands

The opening is now a chain of eight stops: at each one you fix a machine and get its element, Life first ([route](../campaign/01-opening/brief.md#the-route)). Two places are built and merged to main: the drill yard (`#yard`, key 7, beats 2 and 3) and the battery (`#battery`, key 6, beats 4 to 7, `BSTEP` in `sim/src/battery.ts`, prompts in `client/src/battery-text.ts`). The other six stops are designed on paper, with Codex concept images, and not built. The battery is still written as your first cast; with Life first it's your second.

## Next

- [ ] The user's answers to the encounter questions (`r3-q-*` on The Morning Everything Breaks). Claude's picks stand until then.
- [ ] The infirmary (Life, the first cast): space diagram, Codex concept from the blockout's footprint, then an LDtk blockout. It's the smallest test of the new shape.
- [ ] The battery as the second element: its infusion text and prompts, and room to heal in its fight.
- [ ] The yard's size against a wizard and the Academy buildings: marked too small. The academy-as-environment concept (`concept-academy`, `r5-academy-*`) is waiting for the user's marks.
- [ ] The user's playtest notes on the yard: round 5's `r5-yard-prompts`, `r5-yard-etched`, `r5-yard-soldiers`.
- [ ] The rule for etched glyphs.
- [ ] The battery's repair beat: the well's third state (the `repair` animation is cut and waiting) and "press X to stabilize".
- [ ] The quiet beat's sound. Its proposal and prompts are in the playtest todo doc, not signed off yet.

## How to work here

- **Places start from purpose, then pictures.** What the place is for and what connects to what comes first (the [campaign workflow](../campaign/README.md)). Then Codex draws the concept, one level at a time (world, biome, region, area), each level drawn with its parent's image as reference. Codex runs need no OK first. Then comes an LDtk blockout, and its screenshots guide the art. Buildings are environment at real size, never props. See the [map pipeline](../explorations/2026-11-16-campaign-map-pipeline.md) and [the academy as environment](../explorations/2026-11-15-academy-as-environment.md).
- `npm run check:battery` and `npm run check:yard` drive the rooms and take screenshots (`game/shots/battery/`).
- `?at=<checkpoint>` starts the battery part-way, for example `?at=well-failing`.
- Levels are written by `tools/segments/01-opening/battery-level.py` and `yard-level.py`: rerun them, then `npm run content:build`.
- PixelLab and ElevenLabs need the user's sign-off on the description; Codex and Meshy don't.

## Done

- 2026-11-10 Defence towers, the battery's layout, driving, the turret's aim and pilot flame
- 2026-11-11 The battery as a lesson (no waves or timers)
- 2026-11-12 Beats 5 to 7: the well's flow, dry, infusion, the gate; feed lines and glyph paths
- 2026-11-13 The well rebuilt in 3D, its fall as a rigid-body sim; the second pass approved
- 2026-11-14 The drill yard (`#yard`)
- 2026-11-16 The route: Life first, one element per stop, eight stops; each stop's fight and creatures (designed)
- 2026-11-17 Merged to main (ad06e8c)
- 2026-11-21 The brief rewritten for the route
