# Fire wave critique

**5/10.** The travelling-wave idea reads, and the painted flames fit the game, but the result is a necklace of inflated flame clumps with a weak directional wake, rather than the hot leading edge and sinking, tapered wave the designer requested.

At the game camera the ring remains recognisable; its internal flame detail collapses into orange noise. The close shots flatter that detail. The burst at 0.45 s is particularly weak: a detached vertical crescent with little visual connection to the cast. Keep the travelling wave; Magicka's explosive white disc would solve a different brief.

## Three changes, in priority order

### 1. Make the wave actually sink, and shorten its trailing combustion

In `WAVE_GLSL.tallAt`, change the final `smoothstep(0.78, 1.32, q)` to `smoothstep(0.80, 1.45, q)`. Retain `overrun: 0.12`.

In `PUFFS.emitParticle`:

- Replace `life` with `(0.16 + 0.10 * rnd(k, 3.0)) * mix(0.7, 1.0, e)`.
- Replace `h = tallAt(tb)` with `h = tallAt(uAge - back)`.
- Change the rejection threshold from `0.04` to `0.001`.
- In `sz`, replace `(0.5 + 0.5 * h)` with `h`, and replace `(0.65 + 0.8 * (1.0 - pow(1.0 - t, 2.0)))` with `(0.85 + 0.25 * sin(t * 3.14159265))`.

In `RISE.emitParticle`, set `life = 0.18 + 0.10 * rnd(k, 23.0)`; replace `tallAt(tb)` with `tallAt(uAge - back)` and its rejection threshold `0.05` with `0.001`.

This removes the late ballooning visible at 0.6 s. Shorter lives play the existing inside-out breakup faster; upright flames retain their upward departure. Height now approaches zero with the wave, including beyond the AoE.

### 2. Build a legible hot front from smaller, better distributed pieces

In `FIRE_WAVE`, set `puffsPerU: 9, risePerU: 8`. In `PUFFS.emitParticle`, change the base size `(0.5 + 0.22 * rnd(k, 5.0))` to `(0.36 + 0.14 * rnd(k, 5.0))` and `ride` to `0.85 + 0.10 * rnd(k, 4.0)`.

In `WAVE_GLSL.angleOf`, define `float f = (k + rnd(k, s)) / max(uCount, 1.0);` and replace both uses of `rnd(k, s)` in its return expression with `f`. This stratifies coverage instead of randomly bunching it.

In `LOOK_PUFF.look`, change the hot multiplier to `vec3(3.0, 2.1, 1.15)` and return `vec4(c * cover, cover * 0.65)`. Keep RGB premultiplied by the original `cover`: lowering alpha alone deliberately adds emission. ACES already compresses highlights; blanket white brightness would erase the painting.

For fan ends, change `edgeOf`'s `smoothstep(0.55, 1.1, d)` to `smoothstep(0.82, 1.1, d)`. Currently almost half the nominal half-angle is attenuated. Preserve the existing spill and red tint.

### 3. Replace the ruler-straight scorch spokes with broken radial deposits

In `GROUND.decal`, replace the `reach` smoothstep with `1.0 - smoothstep(uRmax - 0.45, uRmax + 0.15, d + (vnoise3(vec3(th * 3.0, 0.0, uSeed)) - 0.5) * 0.5)`.

Multiply `spokes` by `smoothstep(0.30, 0.65, vnoise3(vec3(wp.xz * 3.2, uSeed * 0.19)))`; change `spokes * 0.85` to `spokes * 0.55`. Keep blotches. Set `scorchHold: 1.2, scorchEnd: 4.0`. The 2.5 s starburst currently looks mechanically drawn, not deposited by rolling flame.

## Broken

The birth-time height sampling defeats the advertised sinking behaviour. The reversed-edge `smoothstep` in scorch `reach` has undefined GLSL results. Eight slots also silently omit further simultaneous waves, including when older slots contain only scorch; fix allocation before crowd stress review.

**Presentable as the next designer review: no.** Fix the taper and front continuity first, then show moving ring/burst footage at the game camera.
