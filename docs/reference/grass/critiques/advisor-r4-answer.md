# Meadow at gameplay zoom

**The largest gap is on the flat lawn.** Look below the horizontal brick walk. In TARGET, a gold sweep runs past several flower clumps with a deep, cool olive hollow alongside it. The fine blades lean along that sweep. In both NOW frames, the grass has texture and moving light, but the spaces between clumps read as one yellow-green value. The close-up shows where height *would* help. A few tips crossing the first course of brick, the tower plinth or the base of a post would give the eye a scale for the grass. Keep the door thresholds, worn fork and paved forecourt legible.

## First change

Give the existing `comb` field in `groundLawn` control of the **resting colour and blade direction**. It currently adds warm sheen. Use its low values for cool olive troughs and its high values for ochre-green shoulders. Start with sweeps 6–10 u long and 1–2 u wide. Warp their heading gently and turn the long-row `grBomb` stamps along the local sweep. Soften the short stamps between crests. Let gusts lift the lit tips. Freeze time and compare the strip at gameplay zoom, then squint. A warm drift should still connect two beds, and the fork should still lead the eye to the doors. Make this the first A/B before adding geometry.

## Height at the margins

Use one root-anchored, camera-facing cutout quad per painted fan, roughly 0.4–0.8 u wide and 0.15–0.35 u high. Batch a shared atlas in an `InstancedMesh` per visible chunk. Shell layers would spend fill rate on overlapping surfaces for very little change to the outline. [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html)

At build time, jitter seeded candidates on the topmost lawn. Accept the grass side within 1 u of paving or walls (`8*A`), the outer shoulder of a wear spline (use the existing signed `dWear`), or the exterior of a prop where contact B overlaps long grass G. Reject bare centres and footprint interiors. Break the fringe into irregular runs with gaps. Use G to increase height within runs. Start around 2–3 fans per occupied linear unit, capped at 1,000 visible fans per client. Profile cards on/off during four-player spell effects on the target laptop.

Match each root to the local ground palette, contact shade and cloud light. Light fans with the ground’s up normal, lift only the painted tips and bend them with `grGust`. The rounded lobes, dark cores and contact disc in `patch()` give every group its own centre and explain the spotted lawn.

## Ground types

Replace the `mat === 'meadow'` test with a `GroundType` lookup. Each type names a seamless painted tile and scale, worn substrate, value ramp, grey tuft-sheet rows, sweep dimensions, wind strength and verge density/height. Dry grass can share meadow fans with a straw ramp. Heath gets branching sprigs, moss uses flat dabs with zero card density, and reeds get taller silhouettes.

Level authors assign a default type to floor polygons, brush feathered overrides and draw wear splines or long-growth areas. Compile type IDs and blend weights separately from the existing half-unit wear/length/contact/distance map. Feed both layers to the floor and scatter so a painted transition changes colour, blade shape and height together.
