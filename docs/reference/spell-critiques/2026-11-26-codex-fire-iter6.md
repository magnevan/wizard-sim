**7/10 for proximity to Magicka 2.** The painted curls finally give the fire texture, but the smooth white connector, orange-red cauliflower body, and heavy black residue still lack Magicka 2’s integrated white-gold jet and breathing smoke envelope.

**Yes, presentable to the designer now.** It reads as an authored flamethrower at the 30-unit camera, not just in the close-up. I would show it for feedback; I would not call it reference quality. The open-ground shot is the honest test: enemies’ burning effects and hit rims contribute much of the apparent richness in the crowded shots. The fixed 96-degree cone is not a defect.

Apply these three changes in order. All edits below are in `fire.ts`; these are proposed tuning values, not visually verified results. Keep `BODY_MESH=false` and the kit’s premultiplied `ONE / ONE_MINUS_SRC_ALPHA` blend.

### 1. Make larger, hotter rolling masses instead of a necklace of red florets

At 0.9 seconds the individual cells are legible, but their similar scale and orange borders fragment the body. At game distance, the texture compresses into orange clutter. Magicka 2 has fewer dominant gold lobes joining the white jet, with darker gaps around them.

In `RATE`, change `puff` to `40 + 6*n` births/s and `puffLife` to `0.42` (58/s, approximately 24 live at three runes). In `PUFF.particle`, replace:

```glsl
float s = 0.04 + 0.96 * (1.0 - pow(1.0 - age, 1.25));
p.size = (0.18 + w * 0.19) * (0.7 + 0.95 * sin(age * 3.14159));
p.stretch = 0.015;
```

This decelerates outward travel, enlarges the principal curls, and ends their centres at the simulated reach. Keep the existing angular distribution and height. In `LOOK_PUFF.look`, change the colour multiplier endpoints to `(2.0,1.65,0.85)` and `(1.0,0.45,0.10)`, and its age transition to `smoothstep(0.45,0.95,age)`. Change both output `0.48` factors to `0.42`. Retain the existing fade and texture mask. Preserve gold longer without obliterating the painted folds.

### 2. Give the weld a turbulent handoff

The source is brighter now, but still resembles a clean white nozzle attached to a separate bonfire. Magicka 2’s white region expands into irregular yellow combustion.

In `RATE`, use `core: n => 64 + 8*n`, `coreLife: 0.14`. In `update`, set `uCore` to `0.38 + 0.025*n`. In `CORE.particle`, use `p.size = 0.07 + 0.33 * pow(age,1.25)` and `p.stretch = 0.018`; retain the trajectory. In `LOOK_CORE.look`, change noise coordinates from `uv*4.0` to `uv*7.0`, boundary-noise amplitude from `0.22` to `0.70`, colour endpoints to `(1.8,1.65,1.15)` and `(1.5,0.95,0.25)`, and return `vec4(c*m*0.65,0.20*m)`. Fewer overlapping additive sprites should preserve a white centre with a visible gold boundary rather than a uniformly clipped tube.

### 3. Separate airborne smoke from the scorch stencil

The open-ground cloud/residue is too black and visually solid. Reference smoke is black too, but has a broad, soft, changing perimeter.

Set `RATE.smoke` to `4+n`, `smokeLife` to `1.0`. In `SMOKE.particle`, change outward drift `a*0.1` to `a*0.16`, upward drift `a*0.85` to `a*1.25`; retain rapid size expansion. In `LOOK_SMOKE.look`, use colour endpoints `(0.012,0.010,0.009)` and `(0.060,0.050,0.040)`, and alpha multiplier `0.34` instead of `0.48`. Keep smoke order 0.

In `FAN.decal`, change soot’s noise thresholds from `(0.22,0.55)` to `(0.12,0.60)` and soot’s alpha coefficient from `0.82` to `0.55`. Add `vec3(0.035,0.022,0.014)*soot*0.55` to the returned RGB: char should retain brown material, not merely subtract the floor.

### Broken-looking elements

The released open-ground mark has conspicuous clean sandstone holes inside dark lobes, resembling a perforated cutout. The procedural soot mask explains this; it is not evidence of missing geometry. I cannot establish a definite rendering or simulation failure from these stills, nor judge flicker or release continuity reliably from nine samples.
