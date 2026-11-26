**6.5/10 for similarity to Magicka 2:** the painted curls finally read as fire, but the thin white connector, swollen orange body and oversized smoke lobes still miss the reference’s compact, forceful jet and clear separation of heat, flame and soot.

I would not call this designer-ready yet. At 30 units it reads as a small explosion attached to a white string. Magicka 2 preserves a bright central thrust inside an irregular, darker envelope. The wider simulation cone is acceptable; these problems are within its rendering.

These are proposed tuning values, not render-verified fixes. All edits below are in `fire.ts`; apply and compare at the 30-unit camera first. Keep the particle kit’s premultiplied `ONE / ONE_MINUS_SRC_ALPHA` blend throughout.

1. **SMOKE: remove the overlapping balloon silhouette.** The open-ground release frame exposes large, translucent brown circles around a nearly black centre. Magicka’s smoke also gets black, but its edge reads as broken soot rather than separate inflated discs. In `RATE`, change `smoke` from `9 + 3 * n` to `6 + 2 * n`, and `smokeLife` from `1.25` to `0.9`. In `SMOKE.particle`, replace the size assignment with:

   ```glsl
   p.size = (0.45 + w * 0.38) *
     (0.65 + 1.20 * (1.0 - pow(1.0 - a, 3.0)));
   ```

   Change height drift `a * 0.65` to `a * 0.85` (0.94 units/second over the new life). In `LOOK_SMOKE.look`, change alpha multiplier `0.62` to `0.48`; keep both existing colour endpoints. At three runes this is 12 births/second instead of 18, with a smaller silhouette and shorter residual cloud. Keep FAN’s char unchanged: smoke should stop impersonating the floor stain.

2. **PUFF: recover dark gaps and painted detail.** At 0.3 and 0.9 seconds the curls exist, but overlap makes a continuous yellow-orange cauliflower. Reduce `RATE.puff` from `60 + 10 * n` to `48 + 8 * n` (90 → 72/second at three runes). In `PUFF.particle`, change size coefficient `w * 0.17` to `w * 0.14`. Keep life `0.38`, outward motion, angular distribution and pulse curve. In `LOOK_PUFF.look`, replace the young tint `(3.0, 2.3, 1.2)` with `(2.0, 1.35, 0.55)` and old tint `(1.1, 0.32, 0.07)` with `(1.0, 0.26, 0.045)`. Change cover multiplier `0.38` to `0.48`, and RGB multiplier `0.52` to `0.48`. This reduces accumulated glare while giving the curls enough coverage to retain orange detail against sandstone. Leave GLOW unchanged.

3. **CORE: turn the white string into a widening hot jet.** In `FireSpray.update`, change `uCore` from `0.42 + 0.02 * n` to `0.36 + 0.02 * n`. In `CORE.particle`, replace size with `0.08 + 0.40 * pow(age, 0.8)`; retain rate, life `0.16`, and stretch `0.025`. In `LOOK_CORE.look`, change terminal fade `smoothstep(0.55, 1.0, h)` to `smoothstep(0.70, 1.0, h)`. Replace colour endpoints with `(1.6, 1.4, 0.85)` and `(1.35, 0.65, 0.10)`; change output alpha `0.1 * m` to `0.16 * m`. The shorter, broader downstream core should hand into the puffs rather than terminate as a luminous wire.

**Broken-looking:** the release smoke’s overlapping circular boundaries visibly expose the billboard construction. Burning goblins’ black heads/red bodies and attached flames persist after release; those belong to tint/status rendering, not proof of spray failure. No detached emitter, missing texture or rectangular sprite boundary is evident. Still frames cannot establish popping or temporal continuity. Separately, `LOOK_EMBER` uses reversed-edge `smoothstep(1.0, 0.3, ...)`, undefined in GLSL: replace it with `1.0 - smoothstep(0.3, 1.0, length(uv))`; the frames do not prove a resulting failure.
