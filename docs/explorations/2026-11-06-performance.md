# Performance pass (2026-11-06)

Item 5(d) of the overnight list: look for low-hanging fruit, measure first, change only what is safe and local, keep the golden hash (`d13d22ff`) and the look unchanged.

**Player view:** the game should hold 60 fps in a Survive late wave with two wizards and a screen full of goblins, on an ordinary laptop. Survive is the busiest scene, and it got the most out of this pass: the main thread's typical frame went from about 22 ms to about 11 ms in headless Chrome, and the sim step from 0.55 ms to 0.26 ms in node. Rollback makes the sim step matter more than it looks: a late input can mean re-running up to 60 ticks in one frame, which was about 33 ms in Survive and is now about 15 ms.

## How it was measured

`npm run perf` (new: `game/scripts/perf.mjs` and `perf-sim.mjs`) does two things.

1. **The sim in node:** `step()` timed over 6000 ticks of bot play in three set-ups (the Arena; the Arena held at wave 8 with god mode; Survive at wave 12 with god mode), plus the golden replay. It also prints each run's final hash, so a change that is meant to be pure speed can be checked for the same result.
2. **Four busy scenes in headless Chrome, in real time:** the Arena on autoplay (wave 6), Survive at wave 12 (key 3, then the tuning panel's start-wave), the help panel open over a fight (F2), and the tutorial on autoplay. For each: the main thread's ms per frame, split into sim, help previews, `view.draw` and Pixi's render (from a `?perf=1` hook in `main.ts`), WebGL draw calls per frame, **bytes uploaded to the GPU per frame** (texImage2D and texSubImage2D), and bytes allocated per frame (the heap profiler's sampling, which counts what the GC later collects). `--profile dir` saves a CPU profile per scene; `--size 1920x1080` changes the page size.

**A caution on the browser numbers.** Headless Chrome draws with SwiftShader, a CPU renderer in another process. Uploading a canvas there is slow, and when the GPU process falls behind, the page's next upload blocks for 100 ms to 2 s. So the mean and p95 frame times are mostly SwiftShader stalls, and they vary from run to run. **The p50 frame time, the bytes uploaded and the bytes allocated are the numbers to compare.** On a real GPU an upload costs far less, but the bytes are still copied every frame, so fewer bytes still help there.

## Before and after

Sim in node (ms per `step()`, 6000 ticks; the hashes match before and after):

| run | before mean | before p99 | after mean | after p99 |
|---|---|---|---|---|
| Arena autoplay | 0.093 | 0.44 | 0.085 | 0.44 |
| Arena wave 8 | 0.175 | 0.91 | 0.113 | 0.46 |
| Survive wave 12 | 0.555 | 2.31 | 0.262 | 1.68 |
| golden replay (1800 ticks, whole) | 179 ms | | 173–228 ms (noise) | |

Headless Chrome at 1280 × 800 (pixel scale 2, the view is 640 × 400 art px), 10 s per scene:

| scene | p50 frame ms | uploaded KB / frame | allocated KB / frame | sim ms / step (in Chrome) | draw calls |
|---|---|---|---|---|---|
| Arena | 6.1 → 5.5 | 2035 → 1294 | 346 → 232 | 0.33 → 0.32 | 3.3 → 3.3 |
| Survive w12 | 21.7 → 10.9 | 3993 → 2756 | 3398 → 1014 | 1.48 → 0.66 | 9.7 → 10 |
| Help open | 29.6 → 16.5 | 3350 → 1797 | 2579 → 1871 | 0.36 → 0.44 | 28 → 28 |
| Tutorial | 4.2 → 3.4 | 1693 → 1214 | 203 → 81 | 0.23 → 0.22 | 3 → 3 |

At 1920 × 1080 (scale 4, the view is 480 × 270 art px, so Survive's effect canvases shrink more):

| scene | p50 frame ms | uploaded KB / frame | allocated KB / frame |
|---|---|---|---|
| Arena | 8.5 → 6.1 | 2039 → 1257 | 430 → 260 |
| Survive w12 | 54.7 → 12.9 | 3964 → 1753 | 3617 → 701 |
| Help open | 30.4 → 13.9 | 3661 → 1846 | 2180 → 875 |
| Tutorial | 4.0 → 3.5 | 1622 → 1214 | 126 → 95 |

**Download:** the page used to load 1116 kB of script (365 kB gzipped) as one 848 kB chunk and then a waterfall of seven of Pixi's lazy chunks. It now loads 1021 kB (335 kB gzipped) as three files in parallel. PeerJS (121 kB) loads only when a room is made or joined.

## What the profiles showed

- **GPU uploads were the biggest cost in every scene** (30 to 57 % of the profiled time was `texSubImage2D`). There were three sources:
  - The **two effect canvases** (ground and over) are cleared, redrawn and re-uploaded whole every frame. In Survive they covered the whole 48 × 34 arena (832 × 428 px each, 2.8 MB a frame for the pair), most of it off screen.
  - The **actor frame cache** re-uploads a whole 512 px atlas page (1 MB) whenever a new frame lands on it. In a Survive fight that happened about 100 times a second, because enemy frames were keyed by an idle phase that their rigs don't draw at full walking speed.
  - Small canvases (structures, HUD): minor.
- **Enemy steering in the sim:** `clearLine` (is the straight line to the wizard free of rock?) sampled every rock wall at 0.4 u steps, and each sample allocated a two-element array (`segDist`). Survive has 40 rock walls, so this was a quarter of all sim time and most of Survive's 3.4 MB of allocation per frame. `collideWalls` looped 160 wall slots × 96 body slots every tick. The Dijkstra fields (rebuilt every 0.3 s) iterated an array of arrays.
- **Strings in hot paths:** the floor-surface cache key was a string built from every burning or wet cell, every frame, in every view (the game's and the help panel's five). The wall-slab cache built one key string per slab per frame (about 420 in Survive), and pruned the whole cache every frame.
- **Things that were not worth touching:** `w.events` is tiny (0.1 to 0.2 events per tick on average, 12 at most). The extras' accent particles and the enemy-attack effects didn't show up in the profiles or the allocation lists. The rig-frame cache key is a string per body per frame (about 3 KB a frame), which is small next to the rest.

## What changed

Each change is local and gives exactly the same pixels or the same sim result.

**Sim** (`nav.ts`, `walls.ts`; the hash is unchanged in all four node runs and in Chrome):
- `clearLine` skips a wall whose bounding box, grown by the clearance, misses the line's box. Every sample lies inside the line's box, so such a wall can't be within the clearance of any of them (a 1e-6 slack covers rounding, so the answer is the same bit for bit).
- `segLen` / `segT`: `segDist`'s arithmetic without the array, for the hot loops (`clearLine`, `wallAt`, the nav grid, `collideWalls`). `segDist` itself is unchanged for the other callers.
- `collideWalls` runs body by body through a list of this tick's rock walls (in slot order), with the same box test. A body's push depends only on its own position, so the order change gives the same result.
- The neighbour table in `nav.ts` is three flat arrays, so the Dijkstra and downhill loops allocate nothing.

**Client:**
- **The effect canvases are a window onto the field** (`art/vfx.ts` `view()`): they are the size of the view plus a 24 px margin (in steps of 32 px), translated so everything still draws in field px. Where the view is bigger than the field (the Arena and the Sanctum at most window sizes) they are the whole field, as before. In Survive at 1080p this is about 40 % of the pixels to clear, draw and upload.
- **Atlas pages are 256 px** (`art/actors.ts`), so a new frame re-uploads 256 KB instead of 1 MB. The page count went up to keep about 5000 frames. Draw calls didn't move (10 in Survive).
- **The idle phase leaves the frame key where the rig doesn't draw it:** goblins, archers and the brute at full walking speed, and the dummy, bramble and sack always. Checked in Chrome: 1080 paints of random enemy states at four idle phases each gave identical pixels.
- **`poly()`** fills one shared crossings buffer with an insertion sort, instead of a new array and `Array.sort` per call (checked identical on 400 random polygons).
- **The floor surface cache** compares a byte per cell (its kind and fade step) instead of building a string.
- **Wall slabs** reuse last frame's textures while a wall's damage and rise state hold, and the slab cache is pruned only when the set of walls changes.
- **Bundle:** Pixi is in a chunk of its own (cached across deploys, and no waterfall), and PeerJS is loaded on demand (`net/webrtc.ts`). `check:webrtc` passes with the lazy import.
- **`?perf=1`** records per-frame timings on `wizardSim.perf`. `wizardSim` also exposes `app`, `switchScenario` and `startWave(n)` for scripts.

**Verified:** `npm run check` (341 tests), `check:browser` (Chrome and node agree on `d13d22ff`), `check:net`, `check:webrtc`, `check:menu`, `check:tutorial`; screenshots of the scripted run, Survive at 1080p and the help panel, looked at.

## Bigger opportunities, not taken

Rough cost and benefit, biggest first:

1. **Stop re-uploading whole effect canvases** (high benefit, medium to high cost). They are still the main GPU cost: about 0.9 MB a frame in the Arena, even when little is drawn. Options:
   - Split each canvas into tiles (say 128 px) and upload only those drawn into this frame or last frame. This needs dirty tracking in every primitive in `px.ts` and in the direct `drawImage` calls.
   - Draw the effects with Pixi itself (sprites and Graphics) instead of Canvas2D. That's a big rewrite of `vfx.ts`, `view-structures.ts` and `deaths.ts`.
   - Upload sub-rectangles with our own `texSubImage2D` calls, going around Pixi's `TextureSource.update()`. This is the smallest version, but it ties us to Pixi's WebGL internals.
2. **Upload only the new cell of an atlas page** (medium benefit, low to medium cost): a sub-image upload of the 48 × 56 cell instead of the 256 px page. It has the same Pixi-internals caveat as above.
3. **Help previews repaint wall slabs and frames every loop** (medium benefit for the help panel only, low cost): a preview's world restarts from a snapshot each loop but its clock runs on, so its walls get a new `born` and new cache keys. Keying a preview's slabs by its loop-relative tick, or keeping the clock fixed, would fix it. The help panel is still the slowest scene (16 ms at p50).
4. **A bucket queue for the nav fields** (low to medium benefit, low cost): the integer costs (10 and 14) suit a Dial queue. This would roughly halve the 0.3-second Dijkstra spikes, which are most of Survive's p99 sim step (1.7 ms). It needs care to keep the exact tie order that the hash depends on.
5. **Lazy-load the tune panel and help panel** (small benefit, medium cost): about 60 kB unminified. Both are built at boot and wired into the loop (time scale, pause, `afterStep`), so splitting them needs a small interface first.
6. **The rig-frame key as a number** (small benefit, low cost): pack the quantized fields into one integer, with no string per body per frame.

## Judgment calls (the user can veto)

- The effect canvases cover the view, not the field. Anything drawn more than 24 px off screen is not drawn at all. Nothing reads those canvases back, so nothing should change; if an effect ever seems to pop in at the screen edge, this is the place to look.
- The bigger page count raises the frame cache's ceiling from about 59 MB to 66 MB of canvas (56 pages of 512 px, now 250 pages of 256 px), for the same ~5000 frames, because 256 px pages pack less tightly. It is only reached after a very long session.
- `chunkSizeWarningLimit` is 600 kB: the two boot chunks are each about 510 kB, which is fine.
