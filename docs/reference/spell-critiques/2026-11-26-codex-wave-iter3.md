# Fire wave — iteration 3

**5/10.** The restored flame mass makes this recognisably fire, but the crowded, uniformly orange rim still reads as a rolling wreath rather than a hot advancing front with a tapered, burning-out interior.

The 0.2–0.34 s ring has useful weight; the real-camera strip retains its silhouette in the crowd. The late burst reads as a connected arc rather than two isolated fragments. However, its interior barely explains where that arc travelled. The 5-rune frame exposes the problem most clearly: a thick, lumpy perimeter and scattered interior scraps. The larger puffs improve substance but make individual overlapping curls more conspicuous. The stronger soot/smoke treatment also produces muddy islands at 0.6 s without a convincing radial aftermath at 2.5 s. Those are costs of this iteration, not reasons to restore the thin version. The storyboard’s useful distinction is a dominant hot head followed by cooling, directional residue; Magicka’s explosive disc is unnecessary.

## Three changes, in priority order

These are concrete next-pass settings, not verified final tuning. All edits are in `fire-wave.ts`.

**1. Establish a hot head and a cooler wake before adding more volume.** In `LOOK_PUFF.look`, replace the two colour vectors in the first `mix` with `vec3(3.2, 1.8, 0.65)` and `vec3(1.0, 0.42, 0.12)`. Replace its mix weight with `smoothstep(0.12, 0.75, t)`; retain the existing edge tint and premultiplied return. Keep `cover = m * fade * 0.72`—the current code is not literally full cover. In `LOOK_RISE.look`, replace its colour expression with `s * mix(vec3(1.8, 0.95, 0.3), vec3(0.8, 0.24, 0.06), t)`. In `GROUND.decal`, change the hot-line Gaussian denominator `0.06` to `0.025` and its multiplier `0.35` to `0.65`. This concentrates brightness at the advancing boundary and separates the wake by temperature, rather than bleaching the whole mass under ACES.

**2. Distribute births through time locally around the arc.** Angular stratification currently does not prevent holes: each angular slot has an independently random birth time. In `PUFFS.emitParticle`, replace `tb` with:

```glsl
float tb = (mod(k, 4.0) + rnd(k, 2.0)) * uTr * (1.3 / 4.0);
```

In `RISE.emitParticle`, replace `tb` with:

```glsl
float tb = (mod(k, 4.0) + rnd(k, 22.0)) * uTr * (1.05 / 4.0);
```

Every four neighbouring angular slots now span four birth intervals instead of potentially all arriving together. Keep sizes, counts, lifetimes, radial placement and `tallAt` unchanged for this pass. This addresses uneven continuity without another blanket size increase. Both shapes inherit it; retain the existing burst edge taper rather than adding bright endpoint caps.

**3. Make the aftermath directional.** In `GROUND.decal`, change the spoke noise coordinates from `ring * 15.0, d * 0.45` to `ring * 9.0, d * 0.65`; change the spoke threshold `smoothstep(0.56, 0.78, sp)` to `smoothstep(0.45, 0.66, sp)`. Replace `max(spokes * 0.55, bl * 0.7)` with `clamp(spokes * 0.85 + bl * 0.15, 0.0, 1.0)`. Keep the existing reach, inner mask, alpha `0.8` and fade times. Blotches currently overpower the radial construction; strengthen the movement evidence, not just overall darkness.

## Broken

The known terrain defect remains: all particle layers use the cast origin’s `uGy`, so steps can bury or float flames while the decal follows terrain. Also, moving rings use birth-time centres for particles, the current centre for the hot line, and the original centre for scorch; their registration can separate during movement. Neither defect is demonstrated by these stationary, flat-floor frames. No other unequivocal break is visible; the burst’s open interior is a readability weakness, not a missing filled-cone requirement.

**Presentable to the designer for the next review: yes.** It demonstrates the travelling wave and restored mass clearly enough for review; it does not yet satisfy the requested front/interior hierarchy.
