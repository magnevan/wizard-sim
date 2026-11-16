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
