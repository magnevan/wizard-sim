# Arcane beam — second opinion

Based on the supplied frames and code; cadence judgments below are inferred from the shaders, not a viewed video. File references are relative to `game/packages/client/src/view3d/fx/`. Values are starting points to tune at the 30-unit camera.

## What hurts most, in order

1. **Body/core/rim: a rigid neon tube.** Two parallel pink edges, an uninterrupted pale centre and rounded caps make a manufactured rod. At the game camera, this silhouette survives while most surface detail disappears. The pixel reference has a ragged, fluctuating envelope; its energy changes the shape. Here energy changes brightness inside a fixed container.
2. **Surges/glints: white blocks crawling along the tube.** The close frames expose regularly spaced white crossbars. At game scale they become blinking beads. `LINE.look()` combines 70% core widening, whitening and independent 0.22-unit glint cells. These compete for attention without making the beam feel unstable or forceful.
3. **Halo/floor: pink illumination without disturbed air.** The smooth Gaussian halo and broad floor wash make a stationary luminous capsule. Neither bends the sandstone pattern. More additive glow will not deliver the designer's heat-shimmer request.
4. **Impact: contact is visually buried.** At game scale the pale star merges with the target's pale body/equipment. The connection reads more clearly than the injury. The reference's strong target flashes help sell damage; these sheets do not show equivalent readable target response. A larger white star would obscure more of the same target.

## Designer notes → concrete changes

### “Not a huge fan of the way motion is displayed”

Change `arcane.ts`, `LINE.look()` and `surgeOf()`. Remove the independent 30 Hz white-glint mix first. Reduce surge core widening from `0.7` to `0.15`; keep its whitening contribution below `0.25`. Give packets soft, asymmetric profiles rather than sharp white heads. Reduce speed from 19–31 to roughly 8–12 units/s and use irregular seeded spacing: aim for only one or two conspicuous packets on this short staff-to-target connection.

Move the dominant motion into coherent edge deformation, flowing toward contact. Use continuous noise advection at 4–6 units/s; reserve `floor(t*18.0)` for a faint grain modulation of ±8%. Stepped randomness should roughen a moving medium, not replace its motion every frame.

### “The ray is too straight”

Keep the sim endpoints and straight damage axis. Change the visible centre inside `arcane.ts`, `LINE.look()`:

```glsl
float u = clamp(along / max(len, 0.001), 0.0, 1.0);
float e = sin(3.141593 * u);
float bend = e * (0.065 * sin(along*3.2-uClock*15.0)
               + 0.035 * sin(along*7.1-uClock*23.0));
float q = across - bend;
```

Compute body/core/rim distance from `q`, retaining the existing longitudinal cap distance. Modulate body width ±15% with another coherent noise sample; give the halo a slower, larger offset. Anchor deformation at both endpoints. This creates a taut, unstable stream without suggesting a different hit path. Adjust amplitudes until the displacement survives downsampling without becoming a sine-wave rope.

The existing quad already has room for this fragment-space displacement. No ribbon tessellation is needed. In `ArcaneBeam.update()`, retain sufficient `BeamStrip.set()` half-width for the displaced halo.

### “Some effect around the ray … light is bending … very hot objects”

Implement actual refraction in `stage.ts`, `FxStage.render()`. After rendering world and effects to the existing HDR target, render a separate distortion-vector mask, then composite into a second HDR target before `OutputPass`. Never sample the target currently being written. Add an Arcane envelope strip through `ArcaneBeam`'s constructor/update, reusing `beam-strip.ts`'s `STRIP_VERT` and depth-fade approach.

Use two advected noise scales to perturb background UVs, chiefly across the beam. Envelope half-width: 0.45–0.65 units. Peak displacement: 1–2 output pixels, capped at 3; divide by render resolution. Fade displacement to zero inside the bright body, at the outer boundary and at both endpoints. Depth-test the mask against resolved scene depth and reject offsets that drag foreground silhouettes into it. Keep the mask colourless. Evaluate noise from clock and seed, with no temporal accumulation.

## Three additional edits

- **Floor:** in `arcane.ts`, `FLOOR.look()`, remove travelling floor surges and halve `uFK` initially. Let contact own the strongest ground pool.
- **Impact:** in `FLARE.emitParticle()`/`LOOK_FLARE.look()`, shorten the white centre and retain a saturated magenta outer splash: linear RGB around `(1.2, 0.04, 0.7)`, covering alpha 0.7–0.85. Avoid a continuously rotating second star.
- **Shed particles:** in `SHED.particle()`, replace subpixel dots with fewer tapered fragments, half-size 0.04–0.06 units, life 0.15–0.25 s. Bias travel forward and outward; fade with `(1-age)^2`.

## If only one change

**Deform the body/core/rim silhouette in `LINE.look()`.** That rigid capsule is the dominant failure at the game camera. Refraction around an unchanged neon rod would leave it intact.
