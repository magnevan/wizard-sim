# Fire spray critique

**5/10 for proximity to Magicka 2:** ours has recognisable painted fire, smoke and sparks, but its dominant shape is an orange upright wall attached to a thin white cord; Magicka 2 reads as a forceful white jet breaking into intermittent flame against dark smoke and persistent char.

The texture complaint is now partly solved. The hierarchy is not. At 30 units, the painted detail collapses into orange clutter around the targets. The wider simulation cone is acceptable; filling it with equally assertive curls is the problem. These are proposed starting values, not render-validated settings. All changes below are in `fire.ts`; particle sizes are half-heights.

## 1. Make PUFF a travelling, intermittent body

The open-ground frame exposes a near-vertical stack of similarly sized curls. It suggests a burning barrier more than expelled fuel. Reduce overlap, lower the body and give each blotch a readable swell and extinction.

- `RATE`: change `puff` to `36 + 6 * n`, `puffLife` to `0.48` (54 births/s at three runes, versus 78).
- `PUFF.particle`: replace `s` with `0.04 + 0.10*rnd(k,71.0) + 0.94*(1.0-pow(1.0-age,1.5))`. This decelerates outward travel over 0.48 s. Keep the existing angular spread; retain the simulation dimensions.
- Replace the height argument with `axisH(s) + age*0.25 + (rnd(k,74.0)-0.5)*w*0.18`; remove the interpolation toward `w*0.3+0.25`, which lifts the wide fan into a wall.
- Replace size with `(0.16+w*0.24)*(0.5+1.1*sin(age*3.14159))`.
- `LOOK_PUFF.look`: keep the atlas sampling and mask. Set the colour multipliers to young `(2.2,1.7,0.8)` and old `(0.85,0.20,0.035)`, interpolated with `smoothstep(0.15,0.9,age)`. Set fade to `smoothstep(0.0,0.08,age)*(1.0-smoothstep(0.5,1.0,age))`, cover to `m*fade*0.48`. Return `vec4(c*cover,cover)` with the existing premultiplied blend. This preserves painted dark gaps without building an opaque orange curtain.

## 2. Give CORE enough width to lead the effect

The current weld is white but visually threadlike, especially at the actual camera distance. More exposure alone will not fix its silhouette.

- `RATE`: core `120+20*n`, life `0.14`.
- `CORE.particle`: keep `s=age*uCore` and the current reach. Replace size with `0.075+0.32*pow(age,0.9)`; stretch `0.035`. This increases both width and travel speed.
- `LOOK_CORE.look`: keep noise, but change its modulation to `0.85+0.15*noise`; change the longitudinal fade to `1.0-smoothstep(0.70,1.0,h)`. Use colours `(3.2,2.9,2.1)` to `(2.0,1.0,0.18)` and return `vec4(c*m,0.08*m)` instead of alpha `0.35*m`. Retain premultiplied blending. Keep GLOW unchanged initially.

## 3. Separate smoke, char and sparks from the orange mass

- `RATE`: smoke `6+2*n`, life `1.1`; ember `12+4*n`, life `1.1`. In `EMBER.particle`, delete the time-dependent flicker rejection, set size `0.028`, stretch `0.012`; retain its colour ramp and blend.
- `SMOKE.particle`: retain position/drift; size `(0.45+w*0.4)*(0.5+1.65*(1.0-pow(1.0-age,3.0)))`. `LOOK_SMOKE`: use neutral colours `(0.006,0.006,0.007)` to `(0.025,0.024,0.023)` and alpha multiplier `0.48`, retaining order 0 and premultiplied coverage.
- FAN: add shared uniform `uSootOn` to `F` and GLSL. Set it in `update` to `min(1,(t-r.t0)/0.3)` during channel, then `max(0,1-(t-r.end)/2.4)`. Use it instead of `uFanOn` in `soot`; early-return only when both are zero. Replace the return with `vec4(c*k*0.35*(1.0-soot),clamp(k*0.12+soot*0.82,0.0,0.95))`. Extend record cleanup from `1.6` to `2.5` seconds.

## Broken-looking details

The open-ground release leaves a floating brown smoke clump over essentially clean stone: FAN soot currently dies with illumination in 0.3 s. The weld appears to emerge below the visible staff tip; verify attachment against the animated tip rather than compensating with brightness. Embers read as conspicuous white dashes, and their code explicitly hard-disappears particles at 18 Hz. Goblin tint, rim and attached burning licks are separate contributions; their clutter should not be mistaken for missing spray texture. Still frames cannot establish temporal smoothness.
