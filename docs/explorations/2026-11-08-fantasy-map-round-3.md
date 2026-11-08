# The fantasy map, round 3: biomes, the north, landmarks (2026-11-08)

Follows `2026-11-08-fantasy-map.md`. The user ran seed 1207 through an image model to enhance the painted feel and compared the two (both kept locally in `docs/reference/`, not committed). Their notes: "it's pointing in the right direction"; make the biomes "significantly more pronounced"; the north needn't end in the sea, it "can be more of a uncharted frozen land"; increase the overall scale; and "more styles of landmarks... iconic to each biome". They also asked why Arcane is the only field drawn as a line.

## Answers from the page

Q1 fields-first generator, then paint a kept seed. Q2 both looks. Q5 yes, keep pushing the Chart. Q6 **generated made-up names**. Q7 the field overlay is for design only, "but there should be obvious clues of what field is strong there".

## What the paint pass taught us

The model kept the layout and raised the quality a lot, but it garbled long lettering ("THE GRENWOOD", "THM PTEE"). So layout and lettering are now separate outputs: **For painting** is the map with no names, banners or key, and **Lettering** is everything written, on a transparent layer, to lay back on afterwards.

## Why Arcane was a line

It was a choice made in round 1, not a principle: every other field was a broad number per spot from climate, and Arcane was written as "narrow rifts: rare". That was inconsistent with the world docs, where a *field* is broad and a *vein* narrow, and every field has both. Arcane now holds its own region like the others, and the rift stays as a landmark inside it, the one kind of vein that visibly tears the land. Whether the other fields' veins should show is Q9 on the page.

## What changed

- **Every field holds territory.** Land is split into about 15-20 patches, each given the field its climate suits, and the fields blend where patches meet, which is where confluence towns grow. Each has its own ground colour, mountain tone and ground glyphs. The field rules still come from the land, but the map no longer leaves a field with only a thin strip. This is a real change to round 1's model: climate now *picks* a field for a patch, and the patch then owns its ground.
- **Fire and Cold are kept apart** by a climate filter, not a hard rule; it hasn't failed on the seeds checked.
- **The north continues past the map.** Land runs off the top edge and fades to blank paper under "Uncharted".
- **The world is half as big again** per side (3000 x 2400), with more land, regions, towns and rivers at the same drawn size. The cost: smaller glyphs relative to the sheet, so a paint model that downsamples the input may lose the smallest ones (Q8).
- **Generated names,** in a different sound for each field.

## Landmarks

32 kinds, each with a reason to exist, drawn as plain shapes for the paint pass, rated on the page (db `ratings`, `lm-<id>`). Marking one Cut removes it from maps.

- **Cold:** Glacier, Frozen Colossus, Aurora Spire, Ice-Locked Ship.
- **Fire:** Cauldron, Great Forge, Basalt Steps, Ember Tree.
- **Water:** Great Falls, Tide Mills, Drowned City, Maelstrom.
- **Lightning:** Rod Fields, Coil Tower, Storm Eye, Glass Scar.
- **Earth:** Red Mesas, Deep Mine, Carved Faces, Stone Arch.
- **Life:** Elder Tree, Terraces, Giant Blooms, Swallowed Temple.
- **Arcane:** Hanging Isles, Crystal Spires, Unmade Tower, Mirror.
- **Where two fields meet:** Steam Fields, Storm Marsh, Arc Foundry, Lantern Road.

Their names and one-line reasons are placeholders to react to; the lore stays the user's.

## Open

Q8 size of the world; Q9 other fields' veins; which landmarks to keep; and whether the enhanced map should drive the in-game world map.
