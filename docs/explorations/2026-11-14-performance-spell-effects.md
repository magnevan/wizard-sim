# Performance pass: spell effects (2026-11-14)

The user: "My FPS seems to dip quite a bit with some spell effects. I noticed in the battery scenario the flame patch
seems to sink it." A pass over the spell effects' drawing, measured before and after. Nothing changes in how anything
looks (checked pixel by pixel, below), and nothing in the sim.

## How it was measured

`npm run perf` gained scenes that cast for real, over and over, through the measured window (`game/scripts/perf.mjs`):
`battery-idle`, `battery-patch` (Fire Place x3), `battery-spray` (the flamethrower), `battery-ring` (Fire Area) in the
battery after the repair, and `spell-<name>` in the Sanctum for nineteen spells across sprays, beams, novas, places and
missiles. Runs on this machine were noisy (one scene drifted 2x between back-to-back runs), so the numbers below come from
interleaved A/B runs: the HEAD build and this one alternately, three rounds each, median of the per-run means.

## What was slow, and why

The effects are drawn with Canvas2D into CPU-backed canvases every frame and uploaded to the GPU. Chrome records 2D
calls and rasterizes them later, so the cost of thousands of tiny fills shows up in a profile under `drawImage` or
`texSubImage2D`, not `fillRect`. Profiles (`--profile`) pointed at four things:

1. **The fire floor's embers went through `behind()` once per burning cell.** `behind()` draws something on a scratch
   canvas and cuts out whatever stands in front of it, so the battery's walls and props can hide it. In the battery a
   few patches meant ~150 such passes a frame: 60 % of the frame. Now the embers of a run of cells along a row (one
   depth) go through it together: the same pixels, a fraction of the passes.
2. **`behind()`'s scratch canvas was copied whole on every use.** Drawing from a canvas snapshots it; the next write
   that leaves any of it standing (it cleared only the part it used, and clipped to it) copies the whole canvas first,
   and the canvas only ever grew. Now it uses scratch canvases by size class (powers of two), cleared whole, with no
   clip. This speeds up every effect that goes behind things: novas, zones, the flame jet, impacts.
3. **Dithered shapes were filled one pixel at a time.** A translucent ellipse (fog billows, smoke, steam, puffs, scorch)
   was one `fillRect` per lit pixel. Now a wide one is filled a row at a time with a 4x4 Bayer pattern, which lights
   exactly the same pixels (`scripts/dither-check.mjs` compares the two on 600 random shapes; 0 differences). Small ones
   keep the 1x1 fills: a pattern fill costs more to set up, and measured, it only wins from about rx 8 (ellipses), 16 px
   (polygons) and r 24 (glows). Two traps on the way: a pattern made from a GPU-backed canvas is read back from the GPU
   at every fill (a 30x slowdown everywhere until the tiles were made with `X.canvas`), and patterns everywhere made the
   small shapes 2 to 4 times slower (the first A/B run caught it).
4. **The battery's feed lines did a dozen full-view passes every frame** (the shimmer and the worn, carved path layer:
   clears, pattern fills, composites), however little of the view the lines cross. Now those passes keep to the 32 px
   tiles the lines and circles cross, and the layers are cleared whole (the same snapshot trap as 2). The result
   differs from before by blend rounding only: at most 4/255 in a channel on about 0.2 % of the canvas, nothing moved
   or missing.

## Results

Headless Chrome, CPU rendering (`npm run perf`), view.draw ms per frame, median of 3 interleaved runs:

| Scene | HEAD | Now | Change |
|---|---|---|---|
| battery-patch | 95.5 | 30.3 | -68 % |
| spell-frost-fog | 35.6 | 12.2 | -66 % |
| battery-spray | 32.1 | 17.8 | -45 % |
| battery-ring | 31.4 | 24.2 | -23 % |
| battery-idle | 20.6 | 17.7 | -14 % |
| the other 18 spells (2 to 15 ms) | | | within +-10 %, run-to-run noise |

This machine's GPU (`--gpu`, frame-rate cap off), median fps of 2 interleaved runs:

| Scene | HEAD | Now |
|---|---|---|
| battery-patch | 23 | 76 |
| battery-idle | 82 | 99 |
| battery-spray | 77 | 96 |
| battery-ring | 64 | 78 |
| spell-frost-fog | 66 | 142 |

## Round 2: Fire Place

The user asked how Fire Place could go further. Its cost was nearly all the flame sheet: two rows of 1 px columns a
burning cell, up to three colour bands each, thousands of tiny fills a frame, half of it issuing them and half Chrome
rasterizing them at upload.

5. **The flames go into a pixel buffer.** The same loop and maths write each band into a `Uint32Array` the effect
   canvas's size; the written area goes down in one `putImageData` and one `drawImage`. Later writes win as later fills
   covered earlier ones (the colours are opaque), and the buffer is put down before any water or ice glint so the order
   holds on mixed floors: pixel-identical to the fills (checked on two rooms at three times, with fading cells and water
   against the fire: 0 differing bytes).
6. **The spikes were the scorch marks.** Every fire cell that goes out leaves a mark fading over 40 to 55 s, painted on
   a canvas the size of the whole field and uploaded as its own texture whenever any mark faded a step, which with the
   marks a patch leaves is most frames. In the battery that canvas is megabytes: 70 to 100 ms frames, and for up to a
   minute after the fire was out. Now the part of it in view is laid into the effects' ground canvas first thing each
   frame (it sat right under it, and that one is uploaded anyway), only over where the marks are. Screenshots of the
   same marks before and after match. The cost: a small copy every frame while any marks exist, about 1 ms with Rain's
   wide damp patches in the Sanctum (+16 %), where the old upload of a small field was cheap.

| Scene | HEAD | Now | |
|---|---|---|---|
| spell-fire-place, draw ms (4 interleaved runs) | 26.1 | 8.0 | -69 % |
| battery-patch, draw ms (3 runs) | 89.3 | 20.7 | -77 % (-68 % after round 1) |
| battery-idle, draw ms (3 runs) | 16.7 | 12.1 | -28 % |
| battery-patch, GPU fps | 23 | 100 | p95 frame 74 -> 15 ms |
| spell-fire-place, GPU fps | 147 | 343 | |
| battery-idle, GPU fps | 93 | 112 | |

## What's left

- No single thing dominates the battery's frame now. The biggest pieces are the feed lines' passes, re-uploading the two
  effect canvases every frame, and `turnedWorld` (the isometric copy of the world, rebuilt at each view entry point;
  caching it is unsafe as it stands, since a rollback can restore different state at the same tick).
- The Fire and Cold novas (~8 to 10 ms in the Sanctum) are the costliest spells left.
- Fire Place could still animate at a lower rate (30 Hz, reusing the last frame) if it ever needs to be cheaper, at the
  cost of steppier flames: the user's call.
