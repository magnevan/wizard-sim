# How flexible building games make pieces fit (2026-11-23)

**Status:** research, waiting on the user. It follows the user's verdict on the step-4.5 courtyard: 30+ visual issues "give off a strong smell that something is fundamentally wrong with our approach", and an independent review that scored the work 4/10. It supersedes the direction of [semantic-plans](2026-11-23-semantic-plans.md), whose checks carry over.

## Why the current approach fails

The user's list is posts all facing one way on curves, railings with gaps onto a cliff, world-aligned coping texture, windows sunk into walls, a planter and a bench on landings, glitches at stair heads, roads with intersecting edges and visible texture smoothing. The reviewer's list (stacked blocks and black slits where cheek walls meet parapets, kerb stubs, a torn ring opening) points the same way.

Nearly every item is a **join nobody authored** (two code-generated surfaces meeting at a shape of any curve and angle) or a **surface drawn by code** (meshes with world-aligned textures). Free-form shapes mean every join is new, so nothing can be made once and reused, and every fix is local.

## What the games do

Three families. Facts are from the sources below. Where something comes from memory, it's marked *(unverified)*.

### 1. Corner pieces on a grid: Townscaper, Bad North

- **The grid:** Townscaper's grid is irregular quads made from a relaxed triangle grid, deterministic per hex. The irregularity is what makes towns look organic, though the topology stays a grid. Stacked layers give height.
- **The data:** the player sets *corners* (this corner is land, house, water). Each cell draws the piece that matches its corners: the dual-grid / marching-squares idea Stålberg has used since Brick Block. Pieces are corner segments rather than whole buildings.
- **Choosing pieces:** Wave Function Collapse picks among pieces that fit (Townscaper, Bad North). Bad North allows pieces to be neighbours only when the vertices on their shared edge match. It also bans tiles per level (no cliffs here, a lot of forest there), and checks each island for navigability, restarting when it fails.
- **What's made by hand:** the tile set (300+ tiles for Bad North, about 500 for a reskin of Townscaper by Stålberg's estimate) and the rules. Decoration is placed against surfaces afterwards.
- **Limits:** WFC is weak at long, thin structures. Grid size is capped. A cell with no fitting piece is allowed to fail silently.

**Why joins never break:** a join is just the edge of a piece, and every piece's edges were made to match. The player edits corners and can't express a broken join.

### 2. Rules written by hand that generate geometry: Tiny Glade

- Walls are drawn as paths. Each element (walls, roofs, windows, arches) has its own pipeline for creation, assembly, morphing and deforming, run on the GPU.
- The developers wrote every rule by hand. When an opening is drawn through a wall, the masonry around it adjusts, and where buildings meet, tower roofs hide the seams.
- **Cost:** two people spent years crafting the rules for a handful of element types. It is code-drawn art done with an artist's hand at its best. Our own code-drawn art was rejected at 1–2/10. This family can work, but only with craft we can't supply through an LLM at scale.

### 3. Made sections swept along paths, with made junctions: Cities: Skylines, spline meshes

- A road is a chain of *segments* joined by *nodes*. A segment is a made model (a straight 64×64 block of road), bent along the curve between nodes. A junction is a separate made node model. Each road also has a level, elevated, bridge, slope and tunnel version.
- The same idea is common for walls, fences and railings: a made cross-section, or a short made module repeated along a curve, with made end, corner and post pieces at fixed spacing, each turned to the curve's tangent *(engine spline-mesh tools generally; unverified for any specific game)*.
- Paralives' walls run at any angle and can curve, outside the grid; how it builds them isn't public. Reports differ on whether doors and windows can go on curved walls in early access.

**Why joins hold:** along a path the made section joins itself, and at the ends a made junction takes over.

## LLMs and levels

Recent papers keep the LLM away from geometry:
- *Constraint Is All You Need* (2025) has the LLM write constraints in a level description language. A layout optimiser places the pieces, and an agent simulation checks the result.
- The AIIDE 2025 database-driven framework has designers assemble levels from libraries of made rooms and facilities, then validates and repairs them in the engine.
- Holodeck has the LLM supply spatial constraints and a solver place the objects.

The pattern: **the LLM chooses and arranges, a deterministic system makes the geometry, and a checker validates.**

## What this means for us

Use families 1 and 3 together, and keep family 2 out of anything visible.

- **Ground and height: corner data on a grid.** The plan says, per grid corner, which terrace (height and material) it belongs to. Each cell draws the made piece for its corner pattern: flat paving, a kerb edge, a retaining edge with coping, a parapet edge, an outside corner, an inside corner, a stair-head notch. A relaxed irregular grid, as in Townscaper, gives organic outlines without free-form geometry. A small number of fixed-radius curve pieces give the round plaza.
- **Lines: made sections swept along paths.** Balustrades, low walls, copings and kerbs are made modules repeated along a path, with posts at fixed spacing turned to the tangent, and made end, corner and junction pieces. A railing run must end in an end post or a building, never in the air, and the validator enforces it.
- **Stairs, gates, building fronts: whole made pieces** at a few fixed widths. Windows belong to wall pieces, so they always line up.
- **Props in slots:** pieces declare where dressing may go. A landing or a tread has no slots.
- **The LLM writes the grid's corners, the paths and the piece choices,** never geometry. It can make a bad layout but not a broken join. The layout checks we already have (walk report, flights landing, agreement) carry over.

## How it scales the user out

Today each issue the user spots is a local fix that comes back in the next place. With a kit:
- every issue is either a missing or bad **piece**, fixed once for every place;
- or a **rule** in the validator, which then catches it everywhere.

The user's early reviews build the kit and the rules. Later places draw on them and need less review. A beauty critic can then compare against approved kit frames instead of judging free geometry.

## Where Meshy fits

Pieces must meet exact edge shapes (Bad North's matching edge vertices). Meshy doesn't produce exact edges, so the workflow is:
1. Fix each join type's cross-section and size: a parapet end, a kerb profile, a stair width.
2. Meshy makes the piece's look from a Codex sheet drawn in the kit's style.
3. A fit step cuts its ends to the join planes, conforms the edge to the standard cross-section, and re-projects textures along the piece.

The fit step is the risk. Test it on a few pieces first.

## Open questions

- **Grid: decided by the user (2026-11-23).** A square grid, not so coarse that it shows, with curves allowed so the grid isn't obvious. The proposed size is 2 u (about 1.2 m: four sim cells, about one and a half wizards wide), to be confirmed in the first test.
  - The size is set by the smallest ground shape we need (a pavement strip, a stair's width), not by the thinnest object. Railings, kerbs and copings sit on cell *edges* as edge pieces or swept paths, so they can be as thin as they like.
  - The grid is hidden by four things:
    - diagonal and rounded corner pieces;
    - large curves as swept edges, with the flat floor clipped under them and the edge piece's coping covering the cut;
    - floor textures laid continuously per terrace, never per cell;
    - props and planting that break up the lines.
- How many pieces does the opening's first place need? Townscaper's reskin estimate of about 500 says a full kit is large. The first test needs perhaps 15–25.
- Who draws the layout? An LLM from a Codex concept sketch, or the user painting corners in a small editor? A small editor would also suit the user's "help early, step out later".

## Sources

- [How Townscaper works: a story four games in the making](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making) (Game Developer)
- [Townscaper grid tutorial](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html) (Boris the Brave, Sylves)
- [Draw fewer tiles by using a dual grid](https://dandylyons.github.io/notes/Clippings/Draw-fewer-tiles---by-using-a-Dual-Grid-system!)
- [Tiny Glade developers on Bevy, proceduralism…](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games) (80.lv)
- [This upcoming game lets you procedurally glue buildings together](https://80.lv/articles/this-upcoming-game-lets-you-procedurally-glue-buildings-together) (80.lv)
- [Dissecting creativity in Tiny Glade](https://deeprootdepths.substack.com/p/tiny-glades)
- [Nodes, segments, lanes](https://github.com/CitiesSkylinesMods/TMPE/wiki/Nodes,-Segments,-Lanes) (TM:PE wiki) and the [road modding dev diary](https://forum.paradoxplaza.com/forum/threads/cities-skylines-green-cities-dev-diary-8-road-modding.1050864/page-2)
- [Using wave function collapse for dioramas](https://80.lv/articles/using-wave-function-collapse-algorithm-for-dioramas) (80.lv) and the [TU Delft paper on Bad North's modules](https://repository.tudelft.nl/file/File_61f5a861-2d70-4064-b259-560174c52f82)
- [Paralives build mode and curved walls](https://www.pcgamer.com/games/life-sim/paralives-is-home-to-the-kind-of-architectural-creative-freedom-i-havent-felt-from-a-life-sim-since-the-sims-2) (PC Gamer) and [a guide to curved walls](https://games.gg/paralives/guides/how-to-build-curved-walls-in-paralives/)
- [Constraint Is All You Need](https://www.pcgworkshop.com/archive/xu2025constraint.pdf), [A Database-Driven Framework for 3D Level Generation with LLMs](https://arxiv.org/html/2508.18533v1), [Holodeck](https://arxiv.org/pdf/2312.09067)
