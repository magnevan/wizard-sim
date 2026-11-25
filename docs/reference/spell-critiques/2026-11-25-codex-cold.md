# Frost ring: second opinion

## What hurts, in order

1. **RIME is the effect’s dominant shape.** At the game camera, the cast becomes a blue-white circular carpet. From 1.00–1.73 s in the close sequence, virtually nothing changes except the caster’s pose. The floor texture disappears beneath uniformly busy frost; the eventual breakup reads as holes in a sticker. The pixel reference leaves substantial ground visible between scattered deposits. Its circle belongs to the moving blast; yours belongs to the residue.
2. **LOOK_BLAST loses its outward impulse and becomes a standing wall.** The sampled sequence suggests “inflate, park, disappear,” and the code confirms the cause: radius eases strongly toward a clamp, while the powder survives until `q = 2.2 + hold`. It spends too much of its visible life parked at the perimeter. The white continuous crest reads as foam around a shallow pool.
3. **LOOK_FRONT collapses; PUFFS settle.** Tooth heights multiply by `1-brk`, visibly retracting into the ground. Puffs track the current front/centre, then sink onto a minimum height. These layers reinforce the designer’s “falls” impression. A snowy blast should lose density while carrying material outward, rather than lower its whole silhouette.
4. **The fine-detail budget obscures the motion.** RIME’s dense grain and veins remain legible longer than the shards, flakes or rolling powder at the actual camera. The bright powder crest also compresses toward white under ACES, reducing the separation between snow and ice. More particles will not repair this hierarchy.

## Fixes for the designer’s notes

### “The wave stops too abruptly … peaks then stops”

In `cold.ts`, change `Slot.draw()` and `PATH_GLSL.frontR()` together. Keep the simulation radius and reach time; use near-linear visual travel, initially `R = r0 + (r-r0)*clamp(q,0,1)`. The current exponent 2.5 has covered about 82% of the distance halfway through the travel, creating a long apparent stall.

Begin shedding opacity **before** arrival. In `LOOK_BLAST.look()`, use `e = smoothstep(0.65+hold,1.35+hold,uQ)` and multiply the entire premultiplied RGBA by `1-e`. Add broad, seeded angular variation of roughly ±0.12 reach times to the erosion threshold so different sectors disappear at different moments. Keep a coherent crest during travel, then open large gaps; do not leave a complete rim waiting to dissolve. Retain the existing lifetime bounds; the late interval can contain only faint detached powder. None of this extends the apparent hit radius.

### “… and falls … fade in a more natural way”

In `cold.ts`’s `LOOK_FRONT.look()`, remove `*(1-brk)` and `*(1-brk2)` from tooth height. Preserve each tooth’s silhouette while a seeded erosion mask and alpha remove it. Fade the basal band too, instead of shrinking it. Shards already have their own ballistic motion; let those supply the small amount of falling ice.

In `PUFFS.emitParticle()`, replace current-age attachment with `centerAt(born)` and a birth position on `frontR(born)`. Use outward displacement `v*tau*(1-exp(-a/tau))`, with `v=2–4 u/s`, `tau=0.15–0.25 s`; fade before any boundary clamp becomes visible. Limit the visible wake to the existing envelope. Remove the floor-height clamp as a visible resting phase: kill or fully fade before contact. Use `smoothstep(0,.05,a)*(1-smoothstep(.12,.55,a))` for alpha, with seeded lifetime variation. Powder should disperse, not land as expanding blobs.

### “The floor effect is way too circular, too opaque”

Rewrite `cold.ts`’s `RIME.decal()`. Its edge currently varies only between 94–100% radius; that cannot defeat the disc. Keep the true outer limit, but cut inward by 0.3–0.8 u using broad world-space noise, then interrupt coverage with radial streaks and irregular empty patches. Start with 40–60% bare stone **from deposition**, not merely during melting.

Set film alpha to 0.12–0.25; reserve 0.45–0.6 for sparse frost ridges. Reduce grain contrast and remove the continuous white rim once the front passes. Use a restrained linear tint around `(0.25,0.6,0.9)`, with sparse near-white grains. In the existing premultiplied blend (`particles.ts`, `premulMaterial()`), multiply **all** residue RGB by its coverage and alpha; the current separate vein/rim emission can keep whitening the floor after lowering film alpha. No change to `GroundDecal.cover()` in `decal.ts` is needed.

## Three additional changes

- In `LOOK_BLAST.look()`, lower the broad crest RGB from 2.1+ toward 1.0–1.3; keep HDR peaks on sparse glints. Preserve a cyan underside.
- Remove most late `FLAKES`; they prolong “snowfall” after the blast’s useful visual statement.
- Give the powder a backward-rolling profile: add vertical rows in `nova-ring.ts`’s constructor and bend `VERT`’s radial offset over height. A thin outward lip over a trailing low skirt will read as transported snow better than a straight leaning curtain.

## If only one change ships

**Replace RIME’s opaque full-disc coverage with sparse, translucent deposits.** It occupies the most pixels for the longest time and currently turns a blast into a persistent floor marker.
