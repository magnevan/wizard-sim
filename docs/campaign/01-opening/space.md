# Segment 1, the opening: space diagram

**Stage 3, up for review.** The user asked for this stage before any building: "My worry is that you'll build everything too tiny otherwise." The plans, the camera preview and the open problems are on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page (`tools/segments/01-opening/`), and all of it is a proposal. Scope since 2026-11-10: beats 1 to 7.

## The maps

| Map | Size (u) | Beats | The user's mark |
|---|---|---|---|
| 1. Lecture hall and cloister | 50 × 34 | 1 | About right |
| 2. Drill yard | 56 × 42 | 2, 3 | Too small; to redraw as a real place |
| 3. The battery | 72 × 64 | 4–7 | About right; four problems to solve |

Maps 4 and 5 (vein trail 86 × 40, way through 76 × 62) are on hold with their beats. Their drawings are in git history, in `tools/opening-blueprint/index.html` before 2026-11-10.

## The real numbers

| | |
|---|---|
| One screen | 30 × 21 units along the screen, with rooms as diamonds |
| What you can see | 7.6 units straight down, 13.6 straight up, 15 sideways, 17 to 20 into the corners. North or west on a plan: about 19. South or east: about 11 |
| Walking | 4.2 units a second, so about 7 s to cross a screen |
| Reach | Fire spray 4.5, Fire ring 3, Place 9, beam 12, turret 8 |
| A wizard | 0.9 units across |
| Today's rooms | 24 × 16. Survive is 48 × 34 |

The view figures come from the page's camera settings and weren't measured in the running game.

## Engine limits to watch

- There's no hard cap on map size, because the nav grid grows to the largest room. Big maps can cost path-finding time (`npm run perf`).
- Rooms no longer have a limit on rock walls (merged 2026-11-10). The rest of a continuous world is deferred (`../../explorations/2026-11-09-continuous-world-todo.md`).

## Assets

On 2026-11-09 the user authorized buying the general art: 158 generations, with 1,772 left until 7 December. **The defence (20 generations) still waits for an Approve** on the page.

## The user's notes on the look (2026-11-09)

- The stone floor's scale is fine.
- The grass was too busy, so its tiles were calmed (`calm` in `art/ground-room.ts`) and its scatter halved.
- "Overall the look feels a bit intense, but we haven't done anything with lighting yet, so maybe that'll help resolve it." The lighting pass has since been built.
