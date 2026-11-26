# Concept generation

Concept art from the Codex app's image model, which the user's Codex subscription pays for. Since 2026-11-16 this is the main source of concept art for map layouts, places and asset ideas, replacing SVG layouts filled with PixelLab assets. **Nothing generated here ships in the game.** It's for inspiration: layouts, new kinds of asset, and ideas to mix between images. See the [campaign map pipeline](../../docs/explorations/2026-11-16-campaign-map-pipeline.md).

## Running it

```bash
tools/concept-gen/gen.sh <prompt.txt> <out-dir> [reference images...]
```

- The prompt file asks Codex to generate one image and save it under a given name in the current directory (copy one from `prompts/`).
- Reference images are attached with `-i`. Pass the parent level's image first (the region for an area, the district for a close-up) so the places stay consistent, and a camera reference second (`docs/reference/battery-layout-pixel-art-test.png` for game zoom).
- It finds `codex.exe` inside the Codex app (`Get-AppxPackage OpenAI.Codex`), or uses `$CODEX_EXE`. It writes a log beside the image and stops after 15 minutes.
- One image takes about 5 to 8 minutes. Several can run in parallel; five at once worked on 2026-11-16.
- Results go somewhere outside the repo first (a job's `tmp/`). Keepers are saved as JPG in `docs/reference/<topic>/`, and the PNG originals and prompts in the gitignored `.reference/` folder (keep every result).

## The prompt log

`prompts/<date>-<topic>/` holds each batch's prompts as sent. Note what worked under the batch below, so the next prompts start from it.

### 2026-11-16, element order

The district and five close-ups for the [element order brainstorm](../../docs/explorations/2026-11-16-element-order.md). References: the user's `academy-harbor-district-concept.png` and `wizard-academy-with-training-grounds.png` for the district; the district plus `battery-layout-pixel-art-test.png` for each close-up.

- A numbered list of waypoints in reading order came out as one road with every waypoint readable.
- "Show the place as a playable level: generous open ground for a fight between four small wizards..." gave open fighting floors with walls and cliffs as edges at game zoom.
- The model adds good unasked-for ideas (the stepped dry basin, seven coloured channels from the armillary, crystal-backed wolves). Leave room for that by describing what's wrong at a place, not every prop.
- Scale is loose: buildings are large next to the paths and figures. Read sizes off a blockout, not the art.
- Close-ups don't keep the district's geography (the ward line sits beside the academy in its close-up), even with the district attached.

### 2026-11-16, element order round 2

A new district from round 1's district plus the user's harbor concept, then seven close-ups from the new district, and a machine sheet from two close-ups. Nine images, all usable; seven ran in parallel in about ten minutes.

- "Arranged so that every road starts and ends at the courtyard" and "roads leave the academy like spokes" gave the hub shape asked for. Placing each place by direction (behind, to the left, at the bottom) worked.
- Describing what a machine is *for* (lifting water from the gorge to the cistern; conduits to the healers' tools) made the close-ups read as working systems, which round 1's images didn't.
- Naming the action in progress (a wizard feeding fire into a socket, washing an anchor clear) puts the fix itself in the picture, which is the most useful thing for a stop.
- A sheet of eight objects in two rows (working above, broken below) came out clean and consistent: a good way to explore an asset family.
- Battle scenes crowd fast; ask for fewer figures if the layout matters more than the drama.

### 2026-11-16, encounters

Fourteen images for [the opening's encounters](../../docs/explorations/2026-11-16-opening-encounters.md): four creature sheets, a boss sheet, academy buildings, ground materials and the wilds beyond the ward (eight in parallel), then six fight moments made from each place's close-up plus the matching creature sheet.

- Creature sheets: one row on a parchment-grey ground with a small wizard at the left for scale gave consistent sizes. "Real animal first, crystals second" kept the beasts believable.
- A creature's design drifts between sheets (the aurochs became a bear-bull on its own sheet). Pass the sheet you want kept as the reference, not a description.
- Fight moments: "readable like a gameplay screenshot: a modest number of figures, each clearly separated" fixed round 2's crowded finale. Describing the question being answered (a volley breaking on a barrier, a ram stunned on a wall) makes each image explain its stop.
- Three references per call (place, creature sheet, second sheet) worked.

### 2026-11-16, warband sprites

Two tries at game sprites instead of concepts, for the [warband art](../../docs/explorations/2026-11-16-warband-art.md): the five small goblins facing the viewer, and one raider in eight directions. References: a PixelLab sprite upscaled with nearest-neighbour on magenta, plus the warband concept sheet. Both lost to PixelLab drawn at 32 px.

- "Match its pixel-art style exactly" copied the look but not the scale: the five came back with about 100 px of detail each and no clean grid, so they can't be shrunk to 30 px.
- With a small sprite as the reference, the turnaround kept a real grid (about 40 px figures) and held the character through eight directions, in the requested order. It invented a curly strap on the sack.
- A magenta background makes yellow-olive look green. Judge colours on the game's ground, not on the key colour.
- A six-frame death strip from the 32 px sprite (8x on magenta, two facings): a real grid (about 8.7 px), all six beats as numbered, and good invented detail (spilled coins, the blade flying). The character drifted rounder and bigger-headed. Converting needs about 64 colours, or the blue hood merges into the green.
- Inputs for image-to-3D (`tools/sprites-3d/prompts/meshy-*.txt`): asked for a smooth turntable-style render in an A-pose on white, with the pixel sprites as design references only. Both came back clean (a front view, and front, side and back on one baseline) and on-model.
- `gen.sh` also runs code prompts: `tools/sprites-3d/prompts/codex-model.txt` had Codex write a whole Blender model script to a given skeleton, and it ran Blender itself to test it.

### 2026-11-17, wizard arms

Prop sheets for the wizard's conjured weapons and guards, for the [warband art](../../docs/explorations/2026-11-16-warband-art.md) review. References: the approved goblin weapon sheet (`tools/sprites-3d/input/roster/weapons.png`) for layout and finish, and the wizard's model sheet (`wizard.png` beside it) for style and size. Each set comes in two directions: A made of the element, B forged with the element as an inlay.

- Both weapon sheets came back clean, on white and in the goblin sheet's finish, in about a minute each. Codex put long weapons lying flat along the bottom on its own.
- "Made of its element" turns weak shapes literal: the flame sword became a torch, the maul a mushroom. Water and Cold both turn pale blue unless their colours are told apart ("deep blue" against "cyan").
- Scale on a sheet is loose even with heights given against the wizard; set sizes when the prop goes in the hand.
- Four at once: the computer ran low on memory and the runs were stopped. Two weapon images survived (one only in `~/.codex/generated_images/`). Run two at a time while other heavy work is open.
- Round 2 (the user: they are magical conjurations, unlike the goblins' gear): the references were the wizard's sheet plus sheet A, and the goblin sheet was dropped. "Not made by any smith ... no wood, leather, rivets or forged metal" kept everything elemental. Naming each draft's fault ("must read as a sword, not a torch") and giving each element a colour of its own fixed them in one try. Two at a time, then one, ran in about three minutes with no memory trouble.
- A "ward of light round a small solid core" gave translucent, more spell-like shields, but most of each is glow (shader work), not mesh.

### 2026-11-21, elemental weapons

Nine sheets of weapon variants for [elemental weapons](../../docs/explorations/2026-11-21-elemental-weapons.md), written by `tools/weapon-variants/prompts.mjs`, with the approved `docs/reference/wizard-arms/weapons-a.jpg` as the reference (plus the wizard's model sheet for the Healing hands). Nine runs, five at a time, about 15 minutes in all; all 50 cells usable.

- A grid of six ("an even grid of 3 columns and 2 rows ... in reading order") came back in the asked order every time and slices cleanly by its emptiest columns and rows (`slice.py`).
- One fixed motif per element across every prompt (Water a blue ribbon, Earth bolted stone plates...) gave a consistent visual language across sheets, and "give each added element its own part of the weapon" kept pairs and triples apart.
- The first five runs again lost their saves under load ("node_repl failed"); their images were in `~/.codex/generated_images/<session>/`, identified by looking. The second batch of four saved normally.

### 2026-11-22, the yard and the walks

Five images in parallel for [the weapons section and the walks](../../docs/explorations/2026-11-22-weapons-yard-and-walks.md), all usable, about eight minutes. The yard and the armoury from `area-courtyard-start.jpg` plus the camera reference; the district's roads from `district-v2.jpg` alone; two road close-ups from the district plus the camera reference.

- "The academy's buildings are the edges of the space at their real size: tall three-storey ranges whose walls rise off the top of the frame" gave buildings at a believable scale for the first time.
- Listing the stations "in order, each hugging the foot of the buildings" kept them in a row along the range, which is the academy concept's route.
- A road drawn "diagonally from the top left to the bottom right" with a named moment at each point made a walk readable as a level.
- Asking for "roads that are longer and get more room" moved the district's geography even with "keep its geography exactly"-style wording. Use the image for the moments on the roads, and settle the layout in the space diagram.

### 2026-11-23, the map editor

Two images in parallel for the [map editor spec](../../docs/explorations/2026-11-23-map-editor.md), both usable, about two minutes. The reference for both was a greybox shot of patch B (`npm run shot:lab -- <dir> 30,24 --page kit3d --query "layout=patch-b&view=60"`). The first batch of UI art, after the user's "For UI elements you can use codex to generate art".

- A UI mockup laid out panel by panel ("a slim tool bar down the left edge with seven icon buttons… beside it… across the top…") came back in exactly that layout, with short legible labels and the reference level redrawn in both the plan and the 3D view.
- It drew the plan as the pieces seen from above, not flat terrace colours as asked, and it rewrote the given chat lines slightly. Say "flat colour regions only" if the flat look is wanted.
- An icon sheet of "12 icons in 3 rows of 4… each centred in its own equal square", with the action named in brackets after each picture, came back clean, in one style, and in the asked order, ready to cut.


### 2026-11-24, foliage

One ground texture for the [procedural foliage](../../docs/explorations/2026-11-24-procedural-foliage.md) lab: warm paving flags (`tex-cobble`), with the courtyard concept attached.

- Asked for "warm rose-tan, a mid tone, clearly darker than cream", it came back brick red and about nine rows across. The game's copy is re-toned locally (half its colour kept, half replaced by its brightness in a tan, then lightened). Name the colour by pointing at the reference ("the same colour as the floor in the attached image") and ask for more, smaller flags next time.
- Two sprite sheets for the plants (`blossoms`, `leaves`), each "a 4 by 4 grid of sixteen separate ..., each centred in its own equal square cell" on a flat key colour, with one line per row saying what its four cells hold. Both came back exactly as laid out, first try, evenly spaced and clean to key. Asking for the subject "in greys only, like a monochrome value study" (leaves) or "pure white petals shaded in soft cool greys as if made of white porcelain" (blossoms) gave value maps the game can colour itself. Use green for a key under flowers and magenta under leaves.
- A third sheet, `spikes` (lavender, delphinium, foxglove, hanging wisteria), in the same layout and the same "white porcelain" wording: again exact on the first try. "Chunky florets large enough to read from far away" kept them readable at game size.

### 2026-11-24, waterfall

Five images for the [waterfall thread](../../docs/threads/waterfall.md): four styles of fall painted over one grey-box of the real spot (the editor's `view` in the game camera, plus the courtyard concept), and a parts sheet from the concept alone. `make.py` writes the prompts. All five saved on the first try, five in parallel, in about two minutes.

- Saying what is missing ("the stream simply stops... the bare brown rock face in the middle is where it belongs") and calling the fall "the subject of the picture" put it exactly in the gap, with the rest of the layout held in all four.
- One paragraph starting "Style:" was enough to get four clearly different falls from the same scene and camera: a good way to compare styles in place.
- The model matched the water round the fall to each style on its own (flat swirls for the ribbon, realistic chop for the veils), so judge the fall, not the sea.
- The parts sheet ("top row, the parts... bottom row, the same parts assembled... at three sizes, a tiny wizard for scale") came back as laid out, with no labels. The "eight wizards tall" fall is nearer five: scale by wizard is loose.

### 2026-11-24, road

Four images for the [road stones](../../docs/explorations/2026-11-24-road-stones.md): a larger road tile, two sheets of separate stones (kerb blocks, setts) and a paint-over of the court's road. Reference: `court-free-a-2026-11-22.png`, and for the paint-over our own screenshot first.

- "About thirty stones across the image" gave a tile that can cover 9 u, and it tiled as drawn with no visible seam. It came back as coursed rows, not the scattered cobbles of the first tile, and pinker than the court; the game re-tones it.
- "A sheet of sixteen separate kerb stones on a plain flat magenta background, in four rows of four, each seen from straight above" came back exactly as laid out, every stone different, and cuts cleanly (`tools/kit/stones.py`).
- "Repaint the first image with the same camera, the same buildings... changing only how the cobbled road is laid" kept the whole scene and changed only the road: a good way to get a target picture for one material in place.

### 2026-11-25, spell fire

24 images for the [Fire spell concepts](../../docs/explorations/2026-11-25-spell-concepts-fire.md): the Fire spray in seven styles, floors and rings for the leaders, two layer sheets. `make.py` writes the prompts (a fixed scene paragraph plus one "Style:" paragraph); every scene prompt repaints `tools/port-3d-review/img/plaza-26.jpg`.

- One "Style:" paragraph in a fixed scene gave seven clearly different fires with the court, camera, wizards and goblins held in every image, as the waterfall batch found. About four minutes each.
- The first five in parallel all failed to save ("the file tool stalled"), but every image was in `~/.codex/generated_images/<session>/`, and each log names its session id, so they map back to prompts without guessing. Four at a time then saved normally.
- "A burning patch... one connected patch, not a pile of separate fires" still came back as a campfire with one tall flame. Describing the wanted shape instead ("a low, wide carpet of flame covering the whole patch evenly, like burning oil spilled on the stone: many short flame tongues of similar height, knee-high at most") fixed it.
- Naming a cone's angle and length against the wizard's height gave roughly the right fan; the model makes the far end lobed (a heart shape) unless the style names straight streaks running to the cone's edges.
- The breakdown sheet (five parts in a row, four below, the assembled effect wide across the bottom, a tiny wizard for scale, on flat dark grey) came back exactly as laid out with no labels, from the scene image alone.
- Two runs of one prompt into the same folder overwrite each other's log; give each take its own folder.

### 2026-11-25, spell tone

17 images for the [spell tone concepts](../../docs/explorations/2026-11-25-spell-concepts-tone.md): the Arcane beam, the Earth rock in flight and its impact, and the Cold nova in the chosen toon family, one alternative each (crisper or chunkier), and a family sheet with all four spells. `make.py` writes the prompts; every scene repaints `plaza-26.jpg` with the chosen `fire/toon-spray-2.jpg` attached second as "the style every spell in the game is drawn in". All saved; four at a time, about four minutes each.

- The second reference carried the family well: bright core, toon body, rim and floor light came back on every element without restating them per element.
- "A thick, white-hot core... surges... halo" gave thin lasers and a wide pink wash. Saying what it must not be ("not a thin laser: a thick, heavy rope of plasma about as wide as the wizard's hat") and where the light goes ("in a narrow strip under the beam only") fixed both; "swellings racing along it" can turn into a string of beads.
- Earth dust disappears on the warm floor unless asked for "darker ochre-brown than the floor"; name the value, not just the colour.
- "Chunkier" barely changes a rock, and on an impact turned the shards into floor slabs (reads as a quake). "Crisper" gave a real alternative on the nova.

### 2026-11-26, fire element (breakdowns)

The first try of concept art as breakdowns (`docs/explorations/2026-11-26-spell-effects-lessons.md`, section 7) for Fire's element pass: one parts sheet and five storyboards (burst, ring, patch, Burn, Burning), each with two references: a frame of the approved spray and its flame flipbook (`fire-burn.png`). Kept as `docs/reference/spell-concepts/fire/el-*.jpg`. Five of six came back on the first try, three in parallel; Burn on the second (below).

- A storyboard ("N panels in one row, left to right in time, the same camera... the panels: (1)... (5)") kept the camera, the scale and the characters steady across panels, and every beat landed in order, aftermath included. It reads like a motion breakdown, not a splash painting.
- Telling it that every flame is one of the attached flipbook's sprites carried the approved look into each cast: none came back as one sculpted volume.
- The parts sheet ("each building block alone on black, a short life strip of four to six frames") gave clean rows to rebuild from, and asked-for new parts (a hollow ring flame, a wave-front segment, a scorch cooling) came out as usable as the copied one.
- Sizes need saying in game terms (metres, wizard heights); the ring came back a little wide, so read radii off the sim, not the art.
- Words about hurting yourself trip the image model's filter: "sets him alight... a desperate, self-harming spell" was refused (self-harm, violence). The same look as "a mantle of fire around himself" passed.
