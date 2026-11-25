# Earth: second opinion

Judged primarily from the five game-camera comparisons. The closer sequence diagnoses shapes; it overstates how much grit and shading survive normal play. These stills establish progression, but cannot prove the quality of shake or flicker in motion.

## What hurts, in order

1. **Contact flash: the hit becomes a white floor splash.** Around 0.23 s, disconnected white lobes surround several enemies. At game scale, the brightest shape describes the crowd rather than the rock’s contact. The pixel reference also uses white, but its sharp horizontal accent connects travel to the struck silhouette. Here the contact, flying rock and victim stop reading as one action.
2. **Impact shards and ground layers: too much aftermath, too little collision.** The 0.90–1.57 s frames scatter brown dots across a broad area. They compete with the displaced enemy and imply a general ground eruption. The floor ring, bruise and cracks assert ground damage even when the rock hits a body at staff height. That is a material/placement error, not something stronger shake will repair.
3. **Dust wake: shortening the tube has not removed its construction.** Its straight brown body and parallel pale streaks read as a ribbed sleeve behind the rock. The outside needs separated billows and gaps, not more noise inside a cylindrical boundary.
4. **Missile body: a pebble among equipment.** At the game camera, the brown rock can be mistaken for a shield or dropped prop. Fine facets and grit do little to separate it. Its silhouette needs a simpler value structure and a cleaner wake around it; retain the sim radius.

## Fixes, including the earlier notes

**“Dust cloud reads a bit like a textured tube.”** Change `earth.ts`’s `WAKE.shape()` and `EarthFx.wakeAt()`. The current radius stays broadly continuous; a 1–2.75-unit length cap merely makes a shorter tube. Build three overlapping mesh lobes, sampled from fixed positions along the analytic flight path. Hash each lobe’s radius to 0.55–1.0 times wake radius, with lateral offsets up to 0.35r. Taper both ends; cut actual gaps between lobes. Let each expand by 40%, sink 0.25 units and erode over 0.25–0.4 s. Keep the youngest lobe behind the rock’s silhouette.

In `dust-mesh.ts`, `FRAG.main()`, give the wake a separate opacity/erosion preset: peak alpha 0.45–0.6, falling with `(1-age)^1.5`; raise the erosion threshold from 0.3 to 0.8 over its life. Keep continuous billow motion; quantize only fine breakup to `floor(localTime*18)/18`. Do not flicker the whole cloud. Use non-emissive linear mid RGB approximately `(0.12, 0.075, 0.035)`, with readable dark folds rather than an opaque brown casing.

**“Impact … doesn’t look right … wall or enemy.”** `earth.ts`, `EarthFx.afterStep()`, currently gives terminating `fizzle` impacts no surface classification; `pass` only identifies piercing hits. Extend `earth-impact.ts`’s `Impact` with a visual contact kind and normal, obtained from existing collision/body information. Do not infer “ground” from missile disappearance. If no reliable normal is exposed, suppress floor marks and use incoming direction as a documented fallback.

In `EarthImpacts.update()` and `dustAt()`: ground gets the existing floor layers; body gets no cracks, crater or complete ring, and starts its dust at `i.y`; wall gets a flattened dust fan in the wall plane, offset 0.03 units outward. `GroundDecal` cannot simply become a wall decal: use an oriented mesh for any wall mark. In `drawShards()`, wall fragments rebound into the outward hemisphere; body chips favour forward travel and sideways escape. Keep gravity analytic. Gate floor effects on actual floor contact, preserving all sim hit timings and extents.

**Contact priority.** In `earth-streaks.ts`, `FLASH`, `LOOK_FLASH` and `EarthStreaks.update()`, replace the round cross/disc with a jagged wedge aligned to incoming travel. Reduce half-size from `0.5+1.6r` to roughly `0.2+0.8r`; hold 33 ms, erode to zero by 67 ms. Start at linear RGB `(1.6,1.4,1.0)`, alpha 0.85. ACES already makes the current 3.6 core nearly white. Preserve depth occlusion; avoid covering the victim’s whole torso.

## Three further changes

- In `drawShards()`, halve small-fragment count and their horizontal speeds; retain three substantial chunks. End minor chips within 0.6 s. Concentrate the read around contact.
- In `rock-mesh.ts`, `rockGeometry()`, use fewer, larger visible facets for the missile. Keep one broad light face and a dark underside; random per-face variation currently spends contrast on noise.
- In `earth-streaks.ts`, `STREAKS.emitParticle()`, use three irregular streaks instead of five parallel rails; taper their lengths and suppress the outside pair.

## If only one change ships

**Replace the oversized contact flash with the short directional wedge.** It restores the travel–contact–victim connection at the game camera immediately, without changing gameplay or requiring new collision metadata.
