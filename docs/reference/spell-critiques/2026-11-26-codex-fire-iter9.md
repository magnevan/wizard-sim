**6/10 for closeness to Magicka 2.** The texture problem is substantially improved, but ours reads as a thin white fuse feeding orange explosion balls; Magicka 2 reads as a forceful white-gold jet buried in turbulent fire, dark smoke and grounded char.

The open-ground frame exposes this best: round, similarly sized lobes make a cauliflower silhouette. At 30 units those curls collapse into orange/red visual noise; the reference retains a clear white thrust and dark terminal mass. Copying Magicka 1’s emission recipe has not reproduced Magicka 2’s hierarchy. These are proposed starting values, judged from stills; temporal smoothness needs playback.

1. **Make CORE carry the effect.** In `fire.ts`, set `RATE.core = () => 120`, `coreLife: 0.16`. In `CORE.particle`, keep `s = age * uCore` and the current `uCore` calculation, but set angular spread to `side * uHalf * 0.04 * smoothstep(0.0, 0.4, s)`, `p.size = 0.11 + 0.43 * pow(age, 0.85)` and `p.stretch = 0.03`. This makes overlapping, outward-moving energy rather than a string of little white beads. In `LOOK_CORE.look`, retain `h` and `noise`, then replace the mask/color/return with:

   ```glsl
   float r = length(uv);
   float m = (1.0-smoothstep(0.18,0.92+(noise-0.5)*0.35*h,r))
           * (1.0-smoothstep(0.75,1.0,h));
   vec3 c = mix(vec3(4.0,3.4,2.2),vec3(2.2,1.25,0.35),h);
   return vec4(c*m*0.75,0.12*m);
   ```

   Keep the kit’s `ONE / ONE_MINUS_SRC_ALPHA` blend. Concentrate HDR brightness here; increasing every layer would wash the sandstone out.

2. **Stop PUFF accumulating into opaque red balls.** It actually uses `FIRE_TEX.burn`, not `rolls`; at three runes the code emits 70/s, approximately 63 live sprites. Set `RATE.puff = n => 28 + 6*n`, `puffLife: 0.65` (approximately 30 live at three runes). In `PUFF.particle`, replace travel with `s = 0.04 + 0.96*(1.0-pow(1.0-age,1.4))`; replace `0.8` in angular spread with `1.0`, retaining the simulation’s full half-angle. Set size to `(0.18+w*0.12)*(0.7+1.2*(1.0-pow(1.0-age,2.0)))`, stretch to `0.025`, and vertical rise to `age*age*0.5`. These reduce terminal congestion and give the cells direction. In `LOOK_PUFF.look`, retain flipbook sampling and `m`; replace `c`, `fade`, `cover` with:

   ```glsl
   vec3 c = t*mix(vec3(2.2,1.9,1.5),vec3(0.9),age);
   float fade = smoothstep(0.0,0.04,age)
              * (1.0-smoothstep(0.65,1.0,age));
   float cover = m*fade*0.40;
   ```

   Keep `return vec4(c*cover,cover)` and existing premultiplied blending. This preserves painted detail while preventing the crackle phase dominating the whole stream.

3. **Give the fire a dark, grounded destination.** Set `RATE.smoke = n => 7+2*n`, `smokeLife: 1.35`. In `SMOKE.particle`, use `sb=0.65+0.25*rnd(k,11.0)`, forward drift `a*0.08`, rise `a*1.6`, and size `(0.65+w*0.5)*(0.65+1.6*(1.0-pow(1.0-a,3.0)))`. In `LOOK_SMOKE.look`, retain colors and change alpha to `m*0.65*col.w`; keep order 0 and covering premultiplied blending. In `FAN.decal`, change soot’s radial onset from `smoothstep(0.35,0.8,...)` to `smoothstep(0.25,0.6,...)`, and its alpha coefficient from `0.75` to `0.90`. This should produce broad smoky contrast and readable char, rather than isolated brown smudges.

For the longer smoke life, also set `AIM_N = 96` in `aim-trail.ts`; its current 64-sample history only covers 1.05 seconds. Keep `AIM_DT = 1/60`.

**Broken:** The visible staff remains upright while the jet leaves beside it; `NOZZLE` is a fixed body-relative offset, not the staff tip. Correct the casting pose/socket attachment. Also, `PUFF` currently places centers at `s=1.08`, explicitly beyond the simulated endpoint—even a wall endpoint. Cap centers at `1.0` (addressed above); sprite radius still needs wall clipping. I cannot confirm wall penetration from these open-ground frames. Burning tints and status licks already exist; adding more of them will not fix the spray.
