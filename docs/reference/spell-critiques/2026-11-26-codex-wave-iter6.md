# Fire wave — iteration 6

**6/10.** The travelling ring reads at game distance, but cream-coloured lobes, a scratchy wake and a detached late burst still undermine the hot front and tapered interior the designer requested.

The 0.2–0.34 s ring has a readable expanding perimeter; the crowd view survives the camera distance. Keep that movement. The 5-rune frame exposes the weakness: separated balloon heads around a web of tiny red fragments. The burst at 0.45 s still resembles a floating claw. The storyboard has a clear hierarchy of hot leading body, quieter trailing flame and residue; this build distributes attention among too many small contours. Magicka’s explosion is not the remedy.

## Three changes, in priority order

These are proposed tuning values, not render-verified fixes. All edits are in `fire-wave.ts`.

**1. Flatten and join the puff crest; stop bleaching its entire body.** In `PUFFS.emitParticle`, replace the size seed `(0.44 + 0.28 * rnd(k, 5.0))` with `(0.34 + 0.32 * rnd(k, 5.0))`. After `p.size = sz`, add `p.aspect = 0.72 + 0.28 * rnd(k, 10.0); p.stretch = 0.025;`. Keep `puffsPerU: 7` initially: more overlapping quads will not cure round silhouettes. In `LOOK_PUFF.look`, replace the colour assignment with:

```glsl
float young = 1.0 - smoothstep(0.08, 0.50, t);
vec3 c = s * mix(vec3(0.65, 0.10, 0.015),
                 vec3(1.9, 0.85, 0.16), young);
c += vec3(1.4, 0.65, 0.10) * pow(lum, 5.0) * young;
```

Keep the subsequent edge tint. This concentrates heat in the painted highlights instead of pushing broad yellow areas into ACES cream; short motion stretching gives the heads outward direction.

**2. Ground the dying wave and actually extinguish the fan edges.** In `PUFFS.emitParticle`, replace the Y expression with `uGy + sz * 0.45 + 0.18 * smoothstep(0.45, 1.0, t)`. In `RISE.emitParticle`, reduce the upward displacement coefficient from `0.6` to `0.28`: tips can leave upward without the entire wake levitating. In `WAVE_GLSL.tallAt`, change the sinking interval `(0.65, 1.65)` to `(0.70, 1.75)`. In both emitters change the size factor `mix(0.55, 1.0, h)` to `mix(0.18, 1.0, h)`. Finally multiply `LOOK_PUFF`’s `cover` and `LOOK_RISE`’s `cover` by `e`. This gives a slightly longer, physically smaller finish with vanishing fan ends, rather than merely translucent, elevated remnants.

**3. Turn the scorch sunburst into overlapping radial deposits.** In `GROUND.decal`, change `ring * 9.0` to `ring * 6.0`, `d * 0.38` to `d * 0.75`, and the deposit noise’s `ring * 17.0` to `ring * 11.0`. Change `spokes * 0.85 + bl * 0.15` to `spokes * 0.55 + bl * 0.45`; change scorch alpha `0.55` to `0.42`. The current 0.6/2.5 s marks look like straight wheel spokes, not rolling flame deposits. Preserve the cast-centred residue.

## Broken versus unfinished

**The fan fade is functionally incomplete:** `e = 0` still leaves puff size/height and RISE height nonzero, and neither look explicitly removes edge coverage. This supports the blunt late claw. The cream beads and scratchy interior remain unresolved. Stronger radial scorch now exposes an overly geometric sunburst; without iteration 5 images, I cannot honestly claim a visual regression. No other definite rendering break is established by these stills.

**Presentable for the next designer review: yes.** The travelling-wave decision and shared ring/burst treatment are reviewable; the finish remains visibly unfinished.
