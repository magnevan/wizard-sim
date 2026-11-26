# Fire wave — iteration 5

**6/10.** The travelling ring is readable in the crowd and the burst belongs to the same effect, but cream-coloured beads, a scratchy interior and a miniature floating finish still undersell the designer’s hotter front and tapered wake.

At 0.2–0.34 s the ring has useful mass, but too many curls have equally bright centres; at game distance they merge into a decorative wreath. The 5-rune frame exaggerates that uniform rim. The burst at 0.2 s reads as a rolling front; at 0.45 s it becomes a thin, detached claw. The storyboard’s useful quality is its broad transition from hot leading flame to red, broken trailing flame—not its exact silhouette. Keep the travelling wave; a Magicka-style nova would answer a different brief.

## Three changes, in priority order

All changes below are in `fire-wave.ts`; leave sim dimensions and travel timing alone. These are proposed tuning values, not render-validated results.

**1. Separate the hot crest from a broader, cooler wake.** `PUFFS.emitParticle`: change radial lag `0.65 * t * t` to `1.05 * t * t`. Change the size seed `(0.46 + 0.16 * rnd(k, 5.0))` to `(0.44 + 0.28 * rnd(k, 5.0))`. In `FIRE_WAVE`, change `puffsPerU: 9` to `7`. This makes fewer, less uniform masses and spreads older flame behind the crest instead of packing every age into a narrow necklace.

In `LOOK_PUFF.look`, replace the colour assignment with:

```glsl
vec3 c = s * mix(vec3(3.0, 1.6, 0.45),
                 vec3(0.7, 0.12, 0.025),
                 smoothstep(0.05, 0.45, t));
```

ACES is already compressing the bright overlapping puffs toward cream. Stronger age separation and less green/blue should give a hot leading accent and an orange-red interior without raising the whole rim’s exposure.

**2. End by breaking up and losing coverage, rather than miniaturising the whole arc.** Keep the existing flipbook progression and `tallAt` timing. In `PUFFS.emitParticle`, replace the size multiplier `* h *` with `* mix(0.55, 1.0, h) *`. In `LOOK_PUFF.look`, multiply the final `cover` expression by `h`. In `RISE.emitParticle`, make the same size-multiplier replacement; in `LOOK_RISE.look`, multiply `cover` by `col.y`.

Keep the upward lift and per-particle age shrink. The global envelope now removes coverage while the painted holes can still be seen, rather than squeezing already dying flames into bright suspended crumbs. This directly targets the late burst and arrival bracelet.

**3. Make scorch deposits follow radial flow.** `GROUND.decal`: change `sp`’s noise coordinates from `vec3(ring * 5.0, d * 0.28 + uSeed * 0.13)` to `vec3(ring * 9.0, d * 0.38 + uSeed * 0.13)`. Replace `spokes` with:

```glsl
float spokes = smoothstep(0.49, 0.68, sp)
  * smoothstep(0.32, 0.63,
      vnoise3(vec3(ring * 17.0, d * 1.8 + uSeed * 0.19)));
```

Change scorch alpha `0.45` to `0.55`, and fresh-scorch glow multiplier `0.35` to `0.12`. The 0.6/2.5 s aftermath currently reads as weak square-ish brown patches. Remove the world-space deposit grid, narrow the spokes, and let soot survive the glow.

## Broken / regression check

Moving-cast registration remains code-inconsistent: the hot line uses `uCn`, but scorch uses `uC0` with the moving front’s radius. That can reveal scorch on untraversed ground; stationary screenshots cannot verify it. The burst’s thin finish is visibly poor, but not a missing fan or incorrect sim radius. Without iteration-4 images I cannot establish a visual regression; the applied global shrink plus independent lift explains the current floating-crumb failure.

**Presentable for the next designer review: yes.** It is a readable iteration, with the finish and thermal hierarchy clearly still unresolved.
