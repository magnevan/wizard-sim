**6/10.** The travelling ring reads at the game camera and ring/burst share a convincing family, but pale curled outlines, a weak interior hierarchy and the detached late fan still undersell the designer’s hot, grounded, tapering wave.

At 0.2 s the ring has useful mass; at 0.34 s it becomes a necklace of flame drawings. The five-rune frame magnifies the scratchy interior. The crowd frame communicates “fire circle” clearly, but lacks a dominant leading edge. At 0.45 s the burst still reads as an upright bracket. The scorch no longer reads as a geometric sunburst; at 2.5 s it is barely legible. Compared with the supplied iteration-6 diagnosis, the cream-lobe problem is reduced, not solved. I cannot establish a visual regression without the old frames.

Apply these three changes in order. All locations are in `fire-wave.ts`; these are proposed tuning values, not render-verified results.

1. **Make a connected orange head with a substantially quieter wake.** In `PUFFS.emitParticle`, replace the radius subtraction `0.06 + 1.05 * t * t` with `0.04 + 0.45 * t * t` (equivalently, use `frontAt(uAge - back) - 0.04 - 0.45 * t * t`). Set `p.stretch = 0.0`. In `LOOK_PUFF.look`, replace the mask definition with:
   ```glsl
   float lum = max(s.r, max(s.g, s.b));
   float m = smoothstep(mix(0.04, 0.12, t),
                        mix(0.30, 0.48, t), lum);
   ```
   Change the young colour multiplier from `(1.9, 0.85, 0.16)` to `(2.4, 0.65, 0.055)`; change the highlight multiplier to `(1.6, 0.9, 0.16)`. In `cover`, replace `mix(0.82, 0.28, smoothstep(0.15, 1.0, t))` with `mix(0.90, 0.10, smoothstep(0.12, 0.85, t))`. Retain `h * e`. This concentrates heat and coverage outside, and suppresses the red filigree inside; merely increasing HDR brightness would bleach the pale heads under ACES.

2. **Sink the wave instead of leaving a shrinking, lifted claw.** In `WAVE_GLSL.tallAt`, change the descending smoothstep from `(0.7, 1.75, q)` to `(0.85, 1.55, q)`. In both `PUFFS.emitParticle` and `RISE.emitParticle`, replace `mix(0.18, 1.0, h)` with `h`. In PUFFS, replace the position’s height with `uGy + sz * 0.45 + 0.06 * smoothstep(0.70, 1.0, t)`. In RISE, replace its height with `uGy - 0.02 + 0.12 * smoothstep(0.70, 1.0, t)`. Keep the shared fan-edge multiplier. The flames should lose height continuously, with only their dying tips lifting; do not give the burst a separate animation.

3. **Leave visible, interrupted radial deposits.** In `GROUND.decal`, replace `vec2 ring = vec2(cos(th), sin(th));` with:
   ```glsl
   float bend = (vnoise3(vec3(v * 0.9, uSeed * 0.11))
                 - 0.5) * 0.22;
   vec2 ring = vec2(cos(th + bend), sin(th + bend));
   ```
   Keep the existing spoke/deposit frequencies and 0.55/0.45 blend. Change scorch alpha `m * 0.42 * uScorch` to `m * 0.65 * uScorch`. This bends and breaks the radial residue without restoring a singular dark circumference.

**Broken:** Moving puffs currently lose their random rotation: `particles.ts` replaces the rotation axes whenever stretch is nonzero and projected velocity exceeds its threshold. Change 1 fixes this. Also, scorch remains centred on the cast origin while the ring follows the caster; it cannot accurately record the swept ground. This needs a moving-caster check. Fan coverage now genuinely reaches zero at its ends; the previous endpoint bug is fixed.

**Presentable to the designer: yes**, as a work-in-progress review of travel, taper and shared ring/fan behaviour, not as finished fire.

