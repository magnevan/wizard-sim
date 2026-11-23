# The campaign opening (the morning everything breaks)

Status: active · Last touched: 2026-11-23
Where each stop stands: the board at the top of the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page. The working rules: [staying on track](../campaign/README.md#staying-on-track).
Record: [brief and route](../campaign/01-opening/brief.md) · [element order](../explorations/2026-11-16-element-order.md) · [encounters](../explorations/2026-11-16-opening-encounters.md) · [battery playtest todo](../explorations/2026-11-10-battery-playtest-todo.md) · [Opening Segment review](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) (beats 1 to 7, source `tools/segments/01-opening/`) · [The Morning Everything Breaks](https://claude.ai/artifact/9DwUCZHa8ibckf2vWiFews) (the route, source `tools/element-order/`) · [canon](../campaign/canon.md) · [stylised 3D](../explorations/2026-11-23-stylised-3d.md) · [flexible building](../explorations/2026-11-23-flexible-building.md)

## Where it stands

The opening is now a chain of eight stops: at each one you fix a machine and get its element, Life first ([route](../campaign/01-opening/brief.md#the-route)). Two places are built and merged to main: the drill yard (`#yard`, key 7, beats 2 and 3) and the battery (`#battery`, key 6, beats 4 to 7, `BSTEP` in `sim/src/battery.ts`, prompts in `client/src/battery-text.ts`). The other six stops are designed on paper, with Codex concept images, and not built. The battery is still written as your first cast; with Life first it's your second.

**The art direction is stylised 3D** (2026-11-23): Meshy models from Codex pictures, at Magicka's camera; code-drawn art is rejected ([decisions](../decisions/README.md#2026-11-23-stylised-3d-render-for-the-opening-pixel-and-painted-rejected-explorations2026-11-23-stylised-3dmd)). Places are built from a modular kit on a square grid (`tools/kit/`): the layout is written, code places the made pieces and refuses broken joins. The plan-made levels (court, yard, infirmary) and the pipeline compiler (steps 0 to 4) are on main; the 3D spike that drew the court is archived on tag `archive/kit-test-2026-11-23`.

## Next

- [ ] **The opening's places from the kit** ([flexible building](../explorations/2026-11-23-flexible-building.md)): the courtyard first, traced from plan D (rev 17) into a scene in the map editor, with the kit growing as the trace needs it (the step list is in the [kit-courtyard thread](kit-courtyard.md)); then a loose paint-over of its greybox for the dressing. The kit needs ramps, sloping roads, larger free curves, wall variants and fountain, statue and tower pieces (the trace's list).
- [ ] **The map editor** the user and an LLM edit together: its own thread, [map-editor](map-editor.md). Places after the courtyard wait on it.
- [ ] The yard and the infirmary redone on the kit. Their plan-made levels stay as the layouts' reference: the yard passed flow (rev 3, 7/10), the infirmary flow (rev 7, 8/10).
- [ ] What the yard's rewrite dropped, for its dressing: the old blockout's 153 props and 21 scenery people (`client/src/art/extras.ts`), the old academy grey boxes (`client/src/art/massing.ts`, `?massing=off`), and `tools/segments/01-opening/yard-level.py` (superseded, still referenced by `extras.ts`, `rigs.ts` and `massing-shots.mjs`).
- [ ] The yard's open questions (`r5-yard-prompts`, `r5-yard-etched`, `r5-yard-soldiers`, in its chapter on the segment page).
- [ ] The rule for etched glyphs.
- [ ] The battery's repair beat: the well's third state (the `repair` animation is cut and waiting) and "press X to stabilize".
- [ ] The quiet beat's sound. Its proposal and prompts are in the playtest todo doc, not signed off yet.
- Superseded (2026-11-23): taking the courtyard, the infirmary and the yard through the pixel-era sense lint, sense critic and beauty stage. The courtyard passed sense (8/10, rev 17); its beauty rounds were reverted ([court read](../campaign/01-opening/court-read.md#beauty-in-the-game-2026-11-22)).

## How to work here

- **Places start from purpose, then pictures.** What the place is for and what connects to what comes first (the [campaign workflow](../campaign/README.md)). Then Codex draws the concept, one level at a time (world, biome, region, area), each level drawn with its parent's image as reference. Codex runs need no OK first. Then comes an LDtk blockout, and its screenshots guide the art. Buildings are environment at real size, never props. See the [map pipeline](../explorations/2026-11-16-campaign-map-pipeline.md) and [the academy as environment](../explorations/2026-11-15-academy-as-environment.md).
- `npm run check:battery` and `npm run check:yard` drive the rooms and take screenshots (`game/shots/battery/`).
- `?at=<checkpoint>` starts the battery part-way, for example `?at=well-failing`.
- Levels are written by `tools/segments/01-opening/battery-level.py` (the battery) and `python tools/place-plans/build.py <court-d|yard-d|inf-d>` (walk report, level, resolved scene, content build and check in one command; `yard-level.py` is superseded).
- Kit layouts: `python tools/kit/compile.py <patch-a|patch-b> [out.json]` compiles `tools/kit/layouts/<name>.py` into `game/packages/client/src/lab/kit-<name>.json`, or stops on any error (warnings print); the greybox page is `game/packages/client/kit3d.html` (`?layout=patch-b`), shot with `npm run shot:lab` in `game/`. Meshy pieces are fitted to `kit.json` by `tools/kit/fit.py` (Blender).
- PixelLab and ElevenLabs need the user's sign-off on the description; Codex and Meshy don't.
- Art comes from painted or generated sources (Codex, Meshy), never drawn in code; the beauty critic follows [the beauty rubric](../campaign/beauty-rubric.md).

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
- 2026-11-22 The plan-made levels on main (court D rev 17, yard D rev 3, infirmary D rev 7; a7a87e7); the courtyard passed sense (8/10)
- 2026-11-22 Code-drawn art rejected (the user 1–2/10 against the critic's 6) and its five beauty rounds reverted; the beauty critic calibrated on the user's anchors; Magicka's camera and scale a hard cap
- 2026-11-23 The 3D pivot: a stylised 3D render chosen over pixel and painted; the spike drew the court in 3D (archived on tag `archive/kit-test-2026-11-23`)
- 2026-11-23 The pipeline compiler, steps 0 to 4 (the agreement check, plans as shape ops, what blocks is what's drawn, `build.py`, the yard)
- 2026-11-23 Square grid decided; the modular kit, rounds 1 and 2 (`tools/kit/`, `kit3d.html`, seven Meshy pieces fitted)
