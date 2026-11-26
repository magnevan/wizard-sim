**3/10.** Ours reads as a white rod feeding an orange fog bank; Magicka 2 reads as a pressurised incandescent jet breaking into distinct flame rolls against dark smoke and scorched ground.

These are proposed first-pass values, not render-verified results. Keep the simulation’s angle, reach and channel timing. All edits below are in `fire.ts`; `age` is normalised lifetime and `p.size` is half-height. Retain `One / OneMinusSrcAlpha` premultiplied blending throughout.

1. **Recover the flame body’s structure before adding anything.** At three runes, PUFF emits 320/s with 0.5s life: approximately 160 overlapping sprites, plus 75 GLOW sprites. The atlas already contains detailed curls; this accumulation buries them. At the 30-unit camera, the result is an orange stain.

   In `RATE`, set `puff: n => 48 + 10*n`, `puffLife: 0.40`, `glow: n => 12 + 3*n`, `glowLife: 0.30`. In `PUFF.particle`, replace `s` with `0.04 + 0.12*rnd(k,71.0) + age*(0.84 + 0.12*rnd(k,72.0))`: outward speed becomes 2.1–2.4 cone-lengths/s. Keep the existing angular spread and height. Set `p.size = (0.18 + w*0.32)*(0.45 + 0.85*(1.0-pow(1.0-age,3.0)))`; reduce rotation speed from ±1.2 to ±0.35. Keep the fixed cell per particle: these sixteen pictures are variants, not sequential animation frames.

   In `LOOK_PUFF.look`, retain sampling and `m`; replace colour with `c=t*mix(vec3(2.0,1.8,1.1),vec3(1.0,0.42,0.18),smoothstep(0.2,0.95,age))`. Set `fade=smoothstep(0.0,0.06,age)*(1.0-smoothstep(0.35,1.0,age))`, `cover=m*fade*0.68`; return `vec4(c*cover,cover)`. In `LOOK_GLOW`, change RGB multiplier `0.4` to `0.10`, alpha `0.12` to `0.04`. This makes luminous curls and cooling gaps carry the silhouette.

2. **Replace the welded white capsule with a widening, disrupted jet.** The current hard mask, RGB up to 6, 500 births/s and 0.09s stretch produce a featureless solid object. Magicka’s core expands into its body; ours ends like a fluorescent tube.

   Set `RATE.core: n => 100 + 20*n`, `coreLife: 0.16`; in `update`, set `uCore=0.36+0.02*n`. In `CORE.particle`, set `p.size=0.035+0.22*pow(s/uCore,1.4)`, `p.stretch=0.025`. In `LOOK_CORE.look`, replace the mask/colour/return with:

   ```glsl
   float h=clamp(col.x,0.0,1.0);
   float noise=vnoise3(vec3(uv*4.0,uTime*24.0-h*8.0));
   float m=(1.0-smoothstep(0.25,1.0,length(uv)))
     *(0.65+0.35*noise)*(1.0-smoothstep(0.55,1.0,h));
   vec3 c=mix(vec3(2.8,2.5,1.7),vec3(1.8,0.65,0.08),h);
   return vec4(c*m,0.35*m);
   ```

3. **Make smoke provide a dark, rolling backdrop.** Current smoke reads as a brown vertical smudge detached above the fire. Set `RATE.smoke: n => 8+2*n`, `smokeLife: 1.3`. In `SMOKE.particle`, use `sb=0.65+0.30*rnd(k,11.0)`, radial position `sb+a*0.10`, height `axisH(sb)+0.15+a*0.9`, and size `(0.45+w*0.40)*(0.55+1.35*(1.0-pow(1.0-a,3.0)))`. Keep rotation. Set `p.col.w=smoothstep(0.0,0.10,a)*(1.0-smoothstep(0.30,1.0,a))`. In `LOOK_SMOKE`, use colour endpoints `(0.008,0.006,0.005)` and `(0.035,0.028,0.023)`, alpha `m*0.65*col.w`; retain `vec4(c*a,a)` and order 0.

**Broken in the frames:** At 0.9s and release, targets acquire icy white outlines that overpower the fire: the hit-flash rim is fighting the burning status. The floor is clean again by 2.1s: FAN soot is multiplied by `uFanOn` and disappears within 0.3s of release; it is temporary shading, not persistent char. Several descending `smoothstep` calls, including CORE’s, have undefined GLSL behaviour; replace them with `1.0-smoothstep(low,high,x)`. The proposed core does this explicitly.
