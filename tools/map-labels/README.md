# Atlas Lettering

Published at https://claude.ai/artifact/5SAWjZodk2BiZN2VamX4Ds

The last step of the map pipeline (seed, painting, labels): the chosen painting with names on it. Click empty ground to add a name, drag to move, reroll or type it, and set its kind, land, size, turn, bend and ink. "Save lettered map" exports the full-size JPEG.

- **Names live in the artifact's db**, collection `labels`, one doc per name: `{text, kind, field, x, y, scale, angle, arc, ink}`. `x` and `y` are fractions of the map, so a re-upscale keeps every position. `kind` is `land`, `sea`, `range`, `landmark` or `town`. `field` is the land's type and picks the name style on reroll.
- **`map.jpg` is gitignored.** The painting is generated art and the repo is public. It is published with the page from a local copy, made from `tools/art-trial/out/map-chatgpt-647051-v1-x4.png` (JPEG, quality 86). To change maps, replace it and republish with `files: {"map.jpg": <path>}`.
- The syllable tables and name words are copied from `tools/world-map/gen.js`.
