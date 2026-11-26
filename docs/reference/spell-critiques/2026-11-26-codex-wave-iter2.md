**6/10.** The travelling ring is legible and the taper is structurally improved, but pale, beaded flame and a detached burst front still undersell the designer’s hotter front, tapered interior, and shared animation.

At 0.2–0.34 s the ring reads as a necklace of little flames over a luminous floor outline. At the game camera it becomes a thin bright hoop: readable silhouette, weak fire mass. The 5-rune frame enlarges that weakness. The concept has a yellow leading lip backed by an orange body; this build mostly has the lip. The burst at 0.45 s remains two bright fragments with little connection to the wizard. Do not chase Magicka’s filled white explosion.

The three highest-value changes, in order (all in `fire-wave.ts`; these are starting values for the next render):

**1. Give the front an orange body and overlapping silhouettes, rather than more additive glare.**

- `PUFFS.emitParticle`: change the size base `(0.36 + 0.14 * rnd(k, 5.0))` to `(0.46 + 0.16 * rnd(k, 5.0))`. Keep the existing lifetime and current-age height sampling.
- `LOOK_PUFF.look`: replace the colour endpoints `vec3(3.0, 2.1, 1.15)` and `vec3(1.05)` with `vec3(2.4, 1.25, 0.45)` and `vec3(1.0, 0.70, 0.45)`. Replace `return vec4(c * cover, cover * 0.65)` with `return vec4(c * cover, cover)`. This increases painted coverage relative to added light; the pale floor currently washes through the flames. ACES does not guarantee preservation of painted detail.
- `GROUND.decal`: change the hot-line multiplier `g * 0.8` to `g * 0.35`. Let flame carry the front, not its smooth floor halo.

**2. Make RISE the declining wake shared by ring and burst.**

The same shader already serves both shapes; the missing piece is visible material behind the leading edge, especially inside the fan. Keep PUFFS travelling; deposit RISE behind them.

- `RISE.emitParticle`: change the birth-time multiplier `uTr * 1.25` to `uTr * 1.05`.
- Replace its radius expression with `float r = max(0.0, frontAt(tb) - 0.08);` so deposited flames stay where the front passed.
- After `float a ...` and its lifetime check, add `float t = a / life;`. Multiply the existing `p.size` expression by `(1.0 - 0.55 * smoothstep(0.25, 1.0, t))`.
- Replace the position’s vertical component `uGy - 0.02` with `uGy - 0.02 + 0.4 * smoothstep(0.55, 1.0, t)`; tips should leave upward rather than merely contract into the floor.
- `LOOK_RISE.look`: multiply `cover` by `(1.0 - smoothstep(0.75, 1.0, t))`. Retain the shared `edgeOf` taper. This gives both effects a low, dying interior without filling the fan with an explosion.

**3. Make the aftermath read as deposited soot.**

The 2.5 s frame is barely an aftermath. Keep the agreed hold/end times.

- `GROUND.decal`: change blotch thresholds `smoothstep(0.6, 0.8, ...)` to `smoothstep(0.48, 0.72, ...)`; change `float a = m * 0.5 * uScorch` to `float a = m * 0.8 * uScorch`. Keep broken spokes at `0.55`.
- `FIRE_WAVE.smokePerU`: `1.4` → `2.0`; `LOOK_SMOKE.look` opacity multiplier: `0.4` → `0.5`. Avoid enlarging smoke into another ring.

**Broken:** terrain attachment samples only the caster’s floor height for all particles; on steps, flames can float or intersect terrain despite the conforming decal. The burst’s separated late silhouette is also a functional readability failure. Still frames cannot establish flicker or popping. Without iteration-1 frames I cannot substantiate a visual regression; the reduced puff size is a plausible contributor to the current thinness, not proven deterioration.

**Presentable for the next designer review: yes.** It communicates the chosen motion well enough for direction, with the weak burst and game-camera flame mass explicitly flagged.
