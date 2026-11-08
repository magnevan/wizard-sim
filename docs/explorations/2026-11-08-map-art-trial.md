# Painted map art, one subject at a time (2026-11-08)

Follows `2026-11-08-fantasy-map-round-3.md`. The user ran seed 647051 through Gemini with the page's first paint prompt: "Some features are way too large, and others still look very much like temporary art." Part of that was the prompt, whose landmark notes said "enormous" and "colossal", and which said "parchment" and lost the sea. But the painted landmarks in that result were much better than the drawn ones. That suggested letting the model paint large, one subject at a time, and having the generator place the result at a fixed size.

## The trial

Four Gemini calls (`gemini-2.5-flash-image`, approved by the user), one style line, plain white background: open-pit mine, flat-topped mesa, stepped foundry, lava pool. Cut out with `tools/world-map/cut_art.py`, placed by `art.js`, compared on seed 647051 with the page's Painted art toggle. Originals are in the gitignored `tools/art-trial/out/map-*.png`.

## What it showed

- **Sizes, positions and the sea hold exactly,** on every seed, because the model no longer touches the layout. Lettering still lines up.
- **One-off landmarks work.** The mine and the forge are a clear upgrade at map size.
- **Repeated symbols don't, yet.** One mesa stamped 40 times shows as the same object, its pink-red is far from the ochre ground, and at that size it reads a little like a tree stump. The lava pool's stone rim turns busy when small and reads like a pie.
- **Mixed hands show.** A painted forge beside code-drawn mountains looks like two artists. The more of a region is painted, the less this matters.

## Going on from here

Landmarks: paint the rest. Repeated symbols need simpler subjects, a palette matched to the ground, and three or four variants each. Mountains, trees and settlements are the bulk of what the eye sees, so they'd come next if landmarks hold up.

## Outcome: rejected

The user, on seeing it on the map: "It's very very bad... you generated the assets in isolation, and it shows. They look like stickers on the map and not at all integrated or hand crafted, this approach does not work." The "what it showed" section above judged each object alone and overrated the mine and forge. The art was taken off the page; the plan to paint the rest is cancelled. The originals stay in the gitignored `tools/art-trial/out/map-*.png`.

## Second whole-map pass (same day)

One Gemini call (`gemini-2.5-flash-image`) on seed 647051 with the rewritten prompt, kept in the gitignored `tools/art-trial/out/map-whole-647051.png`. It fixed what the first run got wrong: sizes held, the sea stayed, and there's no writing. But it barely repainted anything, so the map still looks like flat placeholder art. It also came back at 1152 x 896, so towns turned to mush; added an ice-and-lantern landmark on the north coast that doesn't exist; dropped most of the ships and sea monsters; and cropped the frame. A prompt that insists nothing may change seems to get little change.

## Third whole-map pass: Gemini Pro (same day)

The same image and prompt on `gemini-3-pro-image`, kept in the gitignored `tools/art-trial/out/map-whole-647051-pro.png`. Far more faithful than Flash: layout, frame, ships and sea monsters all kept, nothing invented, no writing. But it's still the same flat art with slightly cleaner ink, at 1152 x 928. The model follows the prompt, so the prompt's insistence on no change is now the likely limit.

## Fourth pass: a relaxed prompt (same day)

The user on the strict passes: "this is terrible". They agreed the instructions were too restrictive and proposed a new process: "[generate a seed image] -> [generate a beautiful map] -> label the world based on the image model output", since the input is random and needn't be followed strictly.

One `gemini-3-pro-image` call on seed 647051 with a prompt treating the map as a rough thumbnail and giving full freedom (`tools/art-trial/out/map-free-647051-pro.png`, gitignored). The best Gemini pass so far: the frozen north, badlands, fens and sea are properly repainted, with new landmarks of its own. But it's uneven. The south-western land and most mesas are still close to tracings of the flat glyphs, and small garbled marks appear beside towns. Output is 1152 x 922. It seems to copy finished-looking symbols and repaint what's loose, so a looser input (colour and shapes without glyphs) is the next thing to test.


## Fifth pass: a glyph-free thumbnail (same day)

The same relaxed prompt on `gemini-3-pro-image`, with the input stripped to coast, coloured lands, rivers and rough mountain marks (the page's Thumbnail look; `tools/art-trial/out/map-thumb-647051-pro.png`, gitignored). A big jump: the whole map is in one hand, with nothing to copy and no writing. The land's outline survives. It no longer follows the generator's fields, though: the charred south turned purple and the ochre south-west turned green, so Fire shrank to one volcano. It drew no towns or roads, since the input had none; some trees are as big as regions; and it's 1152 x 922. Labelling from the painting means reading the fields and places from it, not from the generator.

## Sixth and seventh passes: anchoring the prompt (same day)

Two more `gemini-3-pro-image` calls on the same thumbnail, in the gitignored `tools/art-trial/out/`.

- **`map-thumb-647051-a`:** added what each colour means, whole-world proportions, towns and roads, and muted old-map colours. The most hand-drawn result yet, but it dropped the seed's geography for one wide continent.
- **`map-thumb-647051-b`:** the same, plus a sentence naming the big shapes (a land across the top, north-west island, south-west land, southern island, eastern land, one great sea in the middle) and "same 5:4 proportions". It kept the seed's geography and its fields, in one hand, with towns, roads and landmarks of its own. The best so far. The geography sentence was written by hand for this seed, so other seeds need it generated.

The prompt that produced `-b`:

> Paint a beautiful fantasy world map from this rough colour sketch, the way a master illustrator would: confident hand-inked linework with watercolour and gouache, in the slightly muted, natural colours of an old hand-painted map. Same 5:4 proportions as the sketch.
>
> The sketch gives you the geography, so follow its big shapes: a wide land across the top that fades into the unknown, an island in the north-west, a large land in the south-west, a smaller island in the south, a long land down the east side, and one great open sea in the middle of them all. Coastlines can wander and gain bays and islets, but the sea stays a large body of deep blue painted water.
>
> Each colour in the sketch is a land, so keep it where its colour is: white is frozen waste, ochre is canyon badlands and mesas, dark brown is charred volcanic land with lava, green is deep forest, teal is waterlogged fen, grey violet is stormy moor, purple is land warped by magic.
>
> Everything else is yours to invent. This is a whole world seen from far away: mountains and forests are many small map symbols, and no single tree, tower or creature is larger than a small mountain. Scatter many small towns, castles and villages joined by faint dotted roads, and add a few striking landmarks that belong in each land. Everything drawn by one hand and woven into the landscape.
>
> No text, labels or banners: the names will be added afterwards.

## Eighth pass: a second seed, prompt written by the page (same day)

`gemini-3-pro-image` on seed 1207's thumbnail with the geography sentence generated from the world data (`tools/art-trial/out/map-thumb-1207-b.png`, gitignored). It repeated: land shapes, the lake, the central sea and most fields held, in one hand. One drift: the green east of the southern land became charred land. The sentence names the frozen band, then the lands south of it, split at narrow necks. The page's prompt box now writes this prompt for any seed, replacing the strict one.

## Upscaling (same day)

Free and local: Real-ESRGAN (`realesrgan-ncnn-vulkan`, v0.2.5.0) on `map-thumb-647051-b.png`, 1152 x 928 to 4608 x 3712. `realesrgan-x4plus-anime` flattened it to a cel-shaded cartoon. `realesrgan-x4plus` is closer but smooths the watercolour grain and over-sharpens ink, so the kept version blends it 62/38 with a plain enlargement and adds fine grain (`tools/art-trial/out/map-thumb-647051-b-x4.png`, gitignored). The tiniest buildings stay blobs, since an upscaler can only sharpen what the painting has. Good enough to label on; real extra detail would need a larger generation.
