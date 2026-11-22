# The campaign opening (the morning everything breaks)

Status: active · Last touched: 2026-11-22
Where each stop stands: the board at the top of the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page. The working rules: [staying on track](../campaign/README.md#staying-on-track).
Record: [brief and route](../campaign/01-opening/brief.md) · [element order](../explorations/2026-11-16-element-order.md) · [encounters](../explorations/2026-11-16-opening-encounters.md) · [battery playtest todo](../explorations/2026-11-10-battery-playtest-todo.md) · [Opening Segment review](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) (beats 1 to 7, source `tools/segments/01-opening/`) · [The Morning Everything Breaks](https://claude.ai/artifact/9DwUCZHa8ibckf2vWiFews) (the route, source `tools/element-order/`) · [canon](../campaign/canon.md)

## Where it stands

The opening is now a chain of eight stops: at each one you fix a machine and get its element, Life first ([route](../campaign/01-opening/brief.md#the-route)). Two places are built and merged to main: the drill yard (`#yard`, key 7, beats 2 and 3) and the battery (`#battery`, key 6, beats 4 to 7, `BSTEP` in `sim/src/battery.ts`, prompts in `client/src/battery-text.ts`). The other six stops are designed on paper, with Codex concept images, and not built. The battery is still written as your first cast; with Life first it's your second.

## Next

- [ ] The courtyard under the new cycle ([making a place](../campaign/making-a-place.md)): plan D chosen (2026-11-22). Flow on frames done (revision 5, four rounds; [the read](../campaign/01-opening/court-read.md#stage-1-and-2-the-plan-and-flow-on-frames)). The grey-box was walked in-game on 2026-11-22 (4/10: too big at play zoom), so plan D rev 7 pulls it together. In-game round 2 on rev 7 (5/10): the armillary hid the grand stair, so rev 8 flanks the dais with two flights and cuts the armillary to about 70%. Flow passed in the game (rev 10, 7.5/10 after 4, 5, 6, 7). The armillary stays large, with camera sequences at the briefing and the finale (the user). Sense stage started: rev 11 fixes the edges. Then the sense lint (phase 7 of the height thread) and the sense critic (the sense lint, phase 7 of the height thread, and the sense critic) with the leftovers listed in [the courtyard's read](../campaign/01-opening/court-read.md#stage-2-in-the-game-and-whats-left-for-stages-3-and-4).
- [x] The yard's space diagram and blockout (2026-11-22). Next: the user walks it.
- [ ] The infirmary through the cycle: plan D chosen (2026-11-22; the tents open from the start, only their equipment dark). Next: the walk report, then flow in the game.
- [ ] The drill yard through the cycle, after the infirmary: its pre-cycle plan was taken off the segment page on 2026-11-22.
- [x] The district's roads as a space diagram with walk times, and where the small fights go ([district](../campaign/01-opening/district.md), 2026-11-22; up for review).
- [ ] The infirmary (Life, the first cast): space diagram, Codex concept from the blockout's footprint, then an LDtk blockout. It's the smallest test of the new shape.
- [x] The battery as the second element (2026-11-22): Life is your own from the infirmary on (`CAMPAIGN.life`), the Life circle and `CHANNEL` are gone, and the hurt prompt is "Hurt? Heal yourself"; the infusion line stays the user's.
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
- 2026-11-22 The courtyard: seven art rounds plateaued at 6/10; restarted under [making a place](../campaign/making-a-place.md) with four structure plans
- 2026-11-22 The yard reworked as a blockout along the academy (130 × 100, grey-box ranges, stations wait before acting)
- 2026-11-22 The weapons section and the walks brainstormed; the board on the segment page; old layouts and the academy concept archived ([record](../archive/opening-segment-old-layouts-2026-11-22.md))
