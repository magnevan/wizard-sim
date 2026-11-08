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
