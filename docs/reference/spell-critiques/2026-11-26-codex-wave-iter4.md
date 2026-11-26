# Fire wave — iteration 4

**6/10.** Recognisable, substantial travelling fire that survives the game camera, but its rolled orange perimeter and stamped aftermath still answer the designer’s notes only halfway.

The 0.2/0.34 s ring and 0.4 s five-rune ring have useful mass. The burst belongs to the same family, and its softened ends avoid an obvious sector cut. Smoke no longer dominates the aftermath. However, the front still resembles a wreath of individual curls rather than a hotter advancing edge over a thinning wake. At gameplay distance, the internal flame detail collapses into an orange outline. Keep the travelling-wave premise; Magicka’s explosive white disc would solve a different brief.

## Three changes, in priority order

These are proposed starting values, not verified render results. All edits below are in `fire-wave.ts`; keep unmentioned settings.

**1. Put heat and thickness in a consistent radial order.** In `PUFFS.emitParticle`, replace `ride` and the `r` calculation with:

```glsl
float r = max(0.0, frontAt(uAge - back) - 0.06 - 0.65 * t * t);
```

Replace the size factor `(0.8 + 0.35 * (1.0 - pow(1.0 - t, 2.0)))` with:

```glsl
mix(1.0, 0.42, smoothstep(0.15, 1.0, t))
```

In `LOOK_PUFF.look`, replace the colour assignment and `cover` assignment with:

```glsl
vec3 c = s * mix(vec3(4.0, 3.0, 1.35), vec3(1.0, 0.30, 0.06),
                 smoothstep(0.08, 0.65, t));
float cover = m * fade * mix(0.82, 0.28, smoothstep(0.15, 1.0, t));
```

Retain the subsequent edge tint. Young puffs now occupy the outside; older ones fall inward, shrink and uncover the ground. Currently old puffs grow while travelling at different effective ages: colour changes alone cannot establish a clear head. Keep particle counts initially; cutting density risks losing the crowd-view silhouette.

**2. Make arrival subside rather than finish as a shrinking bracelet.** In `WAVE_GLSL.tallAt`, change the falloff `smoothstep(0.8, 1.45, q)` to `smoothstep(0.65, 1.65, q)`. In `PUFFS.emitParticle`, replace the vertical term `t * 0.3 * h` with:

```glsl
0.55 * smoothstep(0.45, 1.0, t)
```

In `RISE.emitParticle`, replace the vertical lift `0.4 * smoothstep(0.55, 1.0, t)` with `0.6 * smoothstep(0.45, 1.0, t)`. Keep `frontAt` and the 12% overrun. This starts the descent earlier, extends the low finish, and lets dying flame fragments lift independently of the collapsing wave height. The current global height multiplier also suppresses the puffs’ upward departure.

**3. Break the scorch’s radial stamp into longer, quieter deposits.** In `GROUND.decal`, change `ring * 9.0` to `ring * 5.0`, `d * 0.65` to `d * 0.28`, the spoke threshold `smoothstep(0.45, 0.66, sp)` to `smoothstep(0.54, 0.74, sp)`, and the deposit multiplier’s noise coordinates `wp.xz * 3.2` to `wp.xz * 5.0`. Change `m * 0.8 * uScorch` to `m * 0.45 * uScorch`. Keep the 85/15 spoke/blotch mix. The 0.6/2.5 s marks currently read as broad brown petals; longer, interrupted, lighter tracks should suggest passage.

## Broken

Moving rings remain structurally misregistered: puffs use `centerAt(tb)`, the hot decal uses the current centre, and scorch uses the cast centre. For change 1, also replace the PUFFS centre with `centerAt(uAge - back)`. Terrain flames still use one caster-height `uGy`; steps can bury or float them. Neither defect is demonstrated by these stationary, flat-floor frames.

The radial treatment risks worsening the aftermath into a more conspicuous stamp; without iteration 3 frames, I cannot establish regression. Current smoke restraint is worth keeping.

**Presentable for the next designer review: yes**, as an intermediate direction review, not a finished effect.
