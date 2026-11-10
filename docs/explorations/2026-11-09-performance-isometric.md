# Performance after the isometric camera and lighting (2026-11-09)

Follows `2026-11-06-performance.md`. Measured with `npm run build`, then `node scripts/perf.mjs --no-sim --gpu --no-heap --size 1920x1080`, on the user's machine: AMD Radeon 780M (integrated) and Ryzen 7 8840HS. The new `--gpu` runs on the real card with the frame cap off, so frames per second measure the whole frame. Earlier runs used a software renderer and couldn't.

## Results at 1080p

| Scene | fps, uncapped | Frames over 16.7 ms | Main thread, mean |
|---|---|---|---|
| Arena, wave 6 | 417 | 1 of 3,333 | 2.2 ms |
| Survive, wave 12 | 193 | 14 of 1,540 | 4.8 ms |
| Academy (art test, many props) | 273 | 4 of 2,185 | 3.0 ms |
| Tutorial | 450 | not counted | 2.0 ms |
| Stress: Survive wave 40 plus 150 extra lights a frame | 180 | 3 of 1,439 | 5.3 ms |

- **Lighting's cost:** Survive runs at 387 fps with `?lighting=0` and 193 with it, about 2.6 ms a frame.
- **4K, stress scene:** 62 fps (16 ms mean, 30 ms p95). This is the one tight case: full-screen passes at 4K on an integrated GPU. Rendering the world at art resolution and scaling up once would remove most of it.
- **Painting the ground:** about 1.1 s for the opening's biggest planned map (72 x 64), on the main thread, once per room, then cached. It wants to sit behind a transition.

## What was fixed

- Wall shadows were rebuilt and triangulated every frame; now only when walls or the mood change.
- Cutting lights by walls allocated on every light; now it reuses its buffers.
- The floor grid's rotation works out each cell's match once.
- Allocation fell from 767 to 364 KB a frame in Survive, and 846 to 242 in the Academy. Most of the rest is existing effect code, and bots raising walls.

## Not measured

- A weaker GPU than the 780M. Nothing here has been run on one.
- More than about 31 bodies on screen. The limit is 96, and bots thin a wave quickly.
- Online play with rollback replays, under the new camera.

## Still the largest costs

About 1.5 MB of effect canvases are uploaded to the GPU every frame, and they're the largest single thing left on the main thread (`texSubImage2D`), as they were on 2026-11-06.

