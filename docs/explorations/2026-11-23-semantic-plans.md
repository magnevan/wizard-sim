# Semantic plans: describing a place by what it is (2026-11-23)

**Status:** superseded in direction by [flexible-building](2026-11-23-flexible-building.md) (its checks carry over). Was a proposal for step 4.5 of the [plan-to-3D pipeline](../../tools/pipeline-3d/index.html), waiting on the user. It answers two of the user's concerns: artifacts that seem built into the pipeline (jagged road edges, flights that end at a cliff or a balustrade), and whether the pipeline leaves room for creative layouts.

## The problem

Plans today paint shapes in order: a fill, then a road strip over it, then a landing rectangle over that, then stairs. The plan never says what anything *is*:
- **Overlaps show.** Where shapes overlap they leave notches and slivers. That was invisible on a grid; at exact scale it's the jagged road edges.
- **Stairs don't know where they go.** A flight is a ramp painted onto the ground, and nothing says it must land somewhere.
- **Parapets are guessed.** They come from a rule (a drop over 1 m gets one) that can't tell a flight's end from a terrace edge.

The agreement check (step 1) catches the picture disagreeing with collision. It can't catch a place that makes no sense.

## The language

A plan declares three kinds of thing.

- **Terrace**: a walkable area with an outline (any polygon: arcs, curves, irregular shapes), one height, and a surface material. Terraces never overlap. Smaller surfaces inside a terrace (a road, an inlay, a lawn) are **surfaces**: outlines on a terrace that change only its material and may sit slightly lower, as a road a kerb below the pavement does.
- **Connector**: how you get between two terraces.
  - **flight**: a run of steps, with a width, a tread, and a landing of a declared depth at each end;
  - **ramp**;
  - **gate**: a gap in an edge.
  - Each connector names its two terraces. The compiler places it across their shared edge and checks it.
- **Edge**: every place two terraces meet, or a terrace meets the outside, has a treatment:
  - **open** (a drop you can be knocked off);
  - **parapet** (a balustrade);
  - **retaining** (a wall face with a coping);
  - **wall** (a building or a high wall).
  - Defaults cover the obvious cases. A drop over 1 m along a route defaults to parapet, unless the plan marks it open, as the user wants for knockback.

Buildings, hero pieces and dressing stay as today: footprints and placed models. A hero's footprint comes from its model.

## What the compiler guarantees

- **No overlaps.** Terraces partition the ground, and surfaces lie inside their terrace. There's no painting order, so no notches.
- **Every flight lands.** Each end meets walkable ground at its declared height with its landing depth clear. Its sides get cheek walls or parapets from the edge rules, never a balustrade across its own end.
- **Every edge has a treatment,** and every drop near a route is either guarded or marked open on purpose.
- **Readable errors.** Each failure names the element and where it is, as the walk report does now.

## Why it helps beyond the artifacts

- **Navigation's region graph comes for free.** Terraces are the nodes; flights, ramps and gates are the portals (step 5a).
- **Collision follows the same declaration:**
  - parapets are thin segments along their edge;
  - open drops are cliffs you can be knocked over;
  - walls are solid.
- **The 3D view gets real semantics:** a flight is drawn as a flight with treads and cheeks, and a parapet as a parapet. Nothing has to infer them from height differences.

## Keeping it creative

- **Shape stays free.** Terraces take any outline and height. The rules check sense, not shape. A rule that forces a shape is a bug in the language.
- **Kits only for repetitive parts:** walls, balustrades, roofs. Hero pieces stay bespoke.
- **Concept to plan, not blank file.** Codex paints a top-down layout sketch (free). A tracer turns its colour regions into terrace outlines, and its painted stairs into connector suggestions, as a first draft to refine. This closes the gap where concept art stopped informing the layout before.
- **The stages that protect divergence stay:**
  - three really different plans per place;
  - the structure critic;
  - concept art as the target the beauty critic compares against.

## LDtk

For 3D places, the compiled plan (the resolved scene) becomes the level format, and the sim's grid is compiled straight from it. LDtk stays for the hand-made pixel rooms. Choosing a visual editor for 3D places is a later, separate question.

## The proof

Rebuild the courtyard's terraces, flights, gates and roads in the new language, and show the artifacts the user circled can't occur:
- jagged road edges;
- flights ending at a balustrade or a cliff;
- notches where shapes meet.

The first step is the courtyard's two flights and the balcony road; then the rest. Done when the courtyard compiles from the semantic plan with the same walk report, the agreement check at 0, and frames of the flights and roads for the user.
