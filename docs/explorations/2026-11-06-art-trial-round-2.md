# The art trial, round 2: the mock room (2026-11-06)

Round 1 (`2026-11-06-art-trial.md`) compared sources prop by prop. The user's answers set up this round: they liked PixelLab's style, doubted straight-on ("there's a reason so much games are isometric you know"), and wanted to experiment with world and wizard detail. So the Academy is a mock room in the running game, for judging three things in play: prop angle, prop detail and wizard detail. It also adds a fourth, from the user's follow-up: how far local tools can stretch art we've already paid for. No PixelLab or Gemini calls were made.

Results and questions are on the Academy Art Trial page, in "Round 2: the mock room".

## What a player sees

Press 5, or pick Academy (art test) in the Esc menu, or open `#academy`. It's a hall with a classroom end behind a partition: shelves and banners along the back wall, a throne, a rune circle, dummies, desks, a lectern, a teacher, targets. You walk round the furniture, and shots stop on it. **O** cycles the prop set and **I** toggles the wizard, and a label at the top right always says which is showing. Each player's choice is their own, so co-op partners can look at different art in the same match. The room has portals, so waves from the tuning panel fight among the furniture.

## Observations

**Lean (`lean`).** The richest set, with real character, and the user's likely direction. Along the back wall, the shelves are turned about 30° while the wall runs straight across, so they look parked at an angle to it. Free-standing furniture doesn't have the problem. The teacher stands about 40% taller than a player's wizard, because the sheet draws at its own scale.

**Simple (`simple`).** The reduction worked once it stopped being a plain colour quantiser. Its first version merged the dark lines into the browns, and the shelves went blank. Merging by light and dark, and protecting vivid colours, fixed that. At game size the difference from `lean` is small, and it's mostly charm that goes. It didn't reduce the "props outshine the wizards" risk as much as expected: size and contrast drive that, not pixel count.

**Code (`code`).** Sixteen straight-on props. The tidiest fit with the floor, and the plainest. PixelLab Pro's straight-on shelf stands among them in the classroom without looking out of place, so those two sources can mix.

**The detailed wizard.** At the steep camera the hat brim hides the head, so the rig's face was never visible. Painting the face as a strip just under the brim was the biggest gain. From behind, the folds work. From the front it's modest: beard and hands cover the belt and folds. Beard strands read as noise at this size and were dropped for a fuller, cleaner wedge.

**Depth.** Props sort with the actors by their spot on the ground, and footprints keep bodies out, so a wizard stands correctly in front of one desk and behind the next. The first layout hid props behind the tall south wall, so they moved north.

## True isometric: what it would cost

Two different things get called isometric:

- **Angled props on today's floor.** This is `lean`. It costs nothing, and the mismatch along walls stays.
- **A true isometric camera.** The whole world turns 45°. The picture is `tools/art-trial/img/iso-still.png`. The same props look far better there, because they stand square to the walls.

What a true switch would touch, from reading the code:

| Part | Cost | Why |
|---|---|---|
| The sim, netcode, replays | None | World coordinates don't change. |
| Depth sort | None | It sorts on screen y, which is still right. |
| Round spell areas | Almost none | A circle turned 45° is still the same ellipse (the squash would go from 0.6 to 0.5). |
| Aiming, mouse | Small | One function: `camera.screenToWorld`. |
| Pad sticks | Small | Turn the stick 45°, or it feels wrong. |
| Character facings | Small | Rigs are procedural in 16 directions, so an angle offset. Art from sprites would be a different story. |
| Floor | Medium | Painted once, but it's written in screen space: flagstones become diamonds. |
| Walls | Medium to large | `art/walls.ts` raycasts one camera-facing side; two faces show in isometric. The tutorial's and Survive's rooms need checking too. |
| Spell effects, telegraphs, placed-spell shapes | Large, and the risk | 213 lines in the client use `FY` directly and about 135 call sites use `gx`/`gy` one axis at a time, mostly in `view-structures.ts`, `art/vfx.ts`, `tutorial-view.ts`, `art/sigil.ts` and `art/deaths.ts`. Anything that computes a direction and squashes only its y is wrong after a rotation: wall arcs, cones, lines, sigils. |
| Room shape on screen | Design cost | A rectangular room is a diamond on a wide screen. Less of a room fits, and Survive's arena reads differently. |

A rough guess is a few focused sessions, with the risk in spell effects rather than the camera. **The cost grows with every room, wall style and effect built on today's camera**, so the time to measure it is before the academy grows.

## Variants: more from what we already have

`tools/art-trial/imgops.py` holds the operations and `variants.py` applies them. Raw images in `game/content/generated/` are never edited; each variant is an asset whose `meta.json` names its raw file, its base and its operations.

| Kind | Verdict |
|---|---|
| Palette swap on flat colour (banners) | Convincing: can't be told from generated. |
| Ramp swap (dark oak, sandstone wall) | Convincing: the lighting survives. |
| Repainting contents (book spines) | Convincing at game size; streaks up close. |
| Cutting a part out (a plinth from the crystal ball) | Convincing, where the part is clearly separate. |
| Mirroring | Convincing, though the light flips too. |
| Light moss on stone | Good. |
| Heavy moss | Weak: the shape goes first. |
| Wear on stone | Fair: chips work, cracks are subtle. |
| Wear on busy art (old chest, frayed banner) | Weak: noisier, or barely visible. |
| Region swaps (shelves) | Clean, but nobody could notice. |
| Ramp swap on speckled colour (the red throne) | Fair: needed a hand-picked ramp. |

**Other cost-saving tricks found:**
- The 16-object sheet costs 10 generations, against 5 for each Pro prop. A sheet plus local variants gives the most per generation by far.
- The room places 30 props from 16 generated images.
- A variant shares its base's footprint, so it adds no collision or map work.
- A reduction pass doubles as a per-prop fix for anything too busy.
- Kept raw results mean improved tools can be rerun for free.
- Untested but likely: recolouring the teacher into students (the robe is a clean ramp).

The wall strips on the page are pictures only: in-game walls are painted live, so moss and age would become settings of that painter. The room's walls are today's Survive stone.

## How it's built

- **`Prop` entity** in LDtk (`asset`, `blocks`). The build reads the asset's footprint and compiles a blocking prop to one or two wall segments in the room's `propRock`, after its `rock`. They're ordinary terrain rock to the sim (`isPropWall` tells the client not to draw them). `content:check` holds them to the 40-wall budget. The Academy uses 38.
- **The asset registry:** `game/content/assets/props/<id>/` holds `meta.json` and images. Metas are bundled; images are separate files fetched when a room needs them, so nobody downloads them for other rooms. A variant lacking a set falls back to its base's.
- **`art/props.ts`** draws them: standing props among the actors, flat ones and all shadows on the floor layer.
- **Golden hash unchanged** (`afcc1d3f`). `CONTENT_HASH` changed because every room gained two empty lists and a room was added.

## Judgment calls (the user can veto any)

1. **Trial art in a public build.** Merging this to main publishes PixelLab images whose terms are unread on the public page, and puts them in a public repo. Each `meta.json` says "not cleared to ship". The user should decide before merging.
2. **`lean` is the default set**, following the user's preference.
3. **Asset ids are plain strings in LDtk,** not an enum: no enum to keep in step, and the check catches typos. The cost is no dropdown in the editor.
4. **Footprints live in the asset, shared by all its sets,** so the room plays the same whichever art shows.
5. **The O and I keys work only in the Academy;** `?wizard=hd` works anywhere and shows the label.
6. **The back wall in a room with props stands 34 px high** rather than 19, so shelves and banners have something to stand against. It's a client rule, not map data.
7. **Fallbacks:** all 16 props exist in all three sets. Variants without a `code` or `simple` image use their base's: the oak, half-empty and swapped shelves and the red throne show their base in the `code` set, and the Pro shelf is `code` only, showing the plain shelf in the other two.
8. **Stray bits erased from `lean`:** the bookshelf's scrolls, the target's loose arrows, the sheet by the desk. The arrow stuck in the target stayed.
9. **The teacher prop is the sheet's wizard,** at its own scale, static, with no story.
10. **Prop metas are bundled into the main script** (a few KB gzipped). Later, an atlas per room should replace separate images.

## Open questions, each with a recommendation

On the page, with an answer box each; unanswered means the pick stands.

1. **`q-5-angle`: angled or straight-on?** Angled for now; the isometric answer settles it for good.
2. **`q-6-prop-detail`: full or simplified?** Full, with the reduction kept for any single busy prop.
3. **`q-7-wizard-detail`: today's or the detailed wizard?** The detailed one; enemies would want the same pass.
4. **`q-8-isometric`: look at a true isometric camera?** Yes, as a test on a branch for one room, before building more rooms. Don't commit yet.
5. **`q-9-variants`: which variations to rely on?** Palette and ramp swaps, repainted contents, cut-outs, mirroring, light moss. Plan on few bought base props.
6. **Prop scale:** should the sheet's props shrink toward the wizards, or the wizards grow? Recommendation: decide after the isometric test, since it changes how big everything looks.
7. **Before anything ships:** read PixelLab's terms.
