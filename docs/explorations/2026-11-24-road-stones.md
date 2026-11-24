# Road stones: paving that follows the road

2026-11-24. The user on the court map: "the road texture looks very repetitive in an unnatural way", where the concept pictures have "naturally flowing stone patterns that hug the edge of the road". First result, not yet judged by the user beyond the notes below.

Pictures: [`docs/reference/court-kit/road/`](../reference/court-kit/road/) (before and after at two spots, a close-up, the paint-over we aim at, and the fully laid experiment).

## What was wrong

- The road tile repeated every 3 u (1.8 m) on fixed world axes, so 8 to 13 repeats stacked up the screen at the game camera. It carried about ten times the detail the screen can show.
- `tools/kit/textures.py` made it seamless by blending it with a half-shifted copy of itself, which left ghost stones all over it.
- Nothing followed the road's edge. The kerb was one plain strip, and the road met it in a bare seam.

## What the concept pictures do

Read from `docs/reference/opening-yard-walks/k1-road-battery.jpg`, `game/content/generated/codex/court-free-a-2026-11-22.png` and a Codex paint-over of our own screenshot (`target-paintover.jpg`):

- a course of long pale kerb stones along each edge, turning every corner with it;
- a row of squared setts beside the kerb;
- cobbles between, each readable, varied in size and tint, in rows that bend with the road.

## What was built

All of it keeps the rule that what you see is painted and code only places it.

1. **A larger road tile.** A new Codex painting with about thirty stones across, drawn tileable and used as drawn (no half-shift blend), at 9 u a tile. The floor shader also reads the same tile again, blurred, turned and at about a seventh of the scale, to lighten and darken the road in broad patches that never line up with the tiles (`MACRO` in `kit-render.ts`). The painting came back pinker than the court, so it is multiplied by a warm tone (`TONE`).
2. **Kerbs as stones.** A scene's kerb pieces are joined into their lines and each line is laid as one row of blocks (`kerbRows` in `game/packages/client/src/lab/kit-road.ts`). No Meshy: the user asked for stones we make ourselves, painted by Codex.
3. **A course of setts** along every edge of a road. The compiler shrinks the road's outline by half a course and writes the line (`road_courses` in `tools/kit/compile.py`, `roads` in `kit.json`); the renderer lays stones along it (`courseStones`).

A stone is cut between two joints of its row. Joints cross the row square to it, and lie on the bisector where it turns, so a stone on a bend is a wedge and the stones at a corner are mitred. The cut then gets rounded corners (each by its own amount), long edges a little out of true, a pillowed top, and sides that wear the picture folded down over the edge. Its top is one stone from a Codex sheet (`tools/kit/stones.py` cuts a sheet of separate stones on magenta into an atlas).

The user's notes on the first pass, which the stone shape above answers: the stones were "too straight edged", the texture dragged on their sides, and "they don't feel like they're cut to match changing angles".

## The fully laid experiment

The user thinks laying the whole road stone by stone is feasible, and it is nearly free from here: `rows` in `kit.json` is how many courses are laid inward from the edge, and a large number lays the whole road in rings (`experiment-fully-laid.jpg`, 80 rows asked, 11 fit). The rows hug the edge and sweep round the curves, which is the look asked for. What it still needs before it could replace the tile:

- stones painted in the road's own colours (the sett sheet is paler than the cobbles, so the road turns patchy);
- something better where rings from two sides meet: now the cobble tile shows through the gap, and pinched stones are left out;
- a look at the cost: the court's kerbs are about 35,000 triangles and its one row of setts about 70,000; a full lay is several times that.

## The user's verdict, and the painted ground (approach 4)

The user on the laid stones: "approach 1-3 are all garbage": the kerb blocks look really bad, their textures glitchy and the transitions jagged, the floor-level setts "interfere weirdly with the ground texture", and the fully laid road reads as a bugged algorithm. The Codex paint-over "obviously looks good... execution is excellent", if not exactly the preferred pattern. So laid stones are off by default in the test below and the painted ground is the direction to pursue.

The paint-over was a repainted screenshot, not something in the game. The test that puts it in the game:

1. `kit3d.html?plan=30` renders the ground from straight above (north up, no shadows, floors and kerbs only): the guide.
2. Codex repaints the guide as a texture "with every edge between road, kerb and pavement in exactly the same place" (`ground-paint.txt`). Both tries kept the edges in place (`painted-ground-plan.jpg`).
3. The renderer lays the painting straight down over that rectangle onto every surface facing up, floors and kerb tops alike (`setGroundPaint` in `kit-render.ts`; `?paint=paint/court-road-a.png&prect=81,31.5625,111,48.4375&pgain=0.68&stones=0`).

Result: `painted-ground-in-game.jpg` and `painted-ground-close.jpg`, real renders at the game camera. Open points: it is paler than the paint-over (a painting made over a lit picture is lit twice; `pgain` only darkens it), the stones are flat (painted shading only), one picture covers 30 by 17 u at about 64 px a u, so the court needs a grid of them with matching borders, and any map edit under a painting means repainting it.

## Trade-offs and what was not done

- The road tile's rows run east to west everywhere, so they cross the north road and run along the east-west street. Only laying the road in rows (the experiment) fixes that.
- Anti-repetition shaders alone (stochastic or hex tiling) were left out: they hide a repeat but scramble a laid pattern.
- A Codex paint-over of the whole road as one unique texture stays the fallback if laid stones don't satisfy; every map edit would invalidate it.
- Kerb stones are not picked in the editor: a click goes through to the kerb piece under them (now its bed of sand).

## Prompts

`tools/concept-gen/prompts/2026-11-24-road/`: the tile, the two stone sheets, and the paint-over.
