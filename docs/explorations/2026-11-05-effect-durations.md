# Effect durations: lingering effects last as long as they look

2026-11-05. Prompted by the user's play-test: "it feels like some effects are way too short. Like placing rain rains for like 1 second. I'd expect like 5+."

## What the player saw

Water Place (Shift+RMB hold, Water alone) drew a dark cloud and a downpour over the cursor for 1.8 s. In the sim it was a one-time soak (the disc hit) plus a puddle. The puddle lasted 20 s, but it only keeps you wet for a second after you step off it. So the rain looked like a passing shower and did what a splash does. A player reads rain as something that *keeps falling*: you place it, a burning ally runs under it, it puts them out. That is the co-op moment the spell should make possible (pillar 3, setting up a partner).

The rule that follows: **if an effect looks like it lingers, it lasts as long as it looks like it should. If it looks instant, it stays instant.** Areas you place are things that linger. Novas, strikes and blasts are instant.

## The audit

Sim durations come from `game/packages/sim/src/config.ts` and `effects.ts`. Drawn durations come from `game/packages/client/src/art/vfx.ts` (event effects have a fixed life; zones and surfaces are drawn for as long as the sim state exists).

| Effect | Sim duration | Drawn duration | Proposed / done |
|---|---|---|---|
| **Water Place (Rain)** | was: one disc hit + puddle (20 s) | was: rain cloud 1.8 s | **Rain zone, 5 s + 1 s per extra Water. Soaks and douses whoever is under it every tick and tops up the puddle every 0.5 s. Drawn as falling rain for its whole life, fading over the last 0.4 s.** Done. |
| Fire Place (Fire patch) | disc hit + fire surface 10 s (burns whoever stands in it: burn 5 s, 6 dps) | flame ring 0.9 s, then the fire sheet for the surface's 10 s (fades over the last 0.67 s) | Already lingers (10 s, longer than the ~5 s suggested). Keep. |
| Cold Place (Frost patch) | disc hit + ice surface 16 s | frost sweep 0.6 s, then the ice for 16 s | Already lingers. Keep. |
| Water + Cold Place (Ice sheet) | disc hit + ice 16 s | as Frost patch | Keep. |
| Water + Fire Place (Steam cloud) | steam zone 6 s, pulses every 0.5 s at 0.25 power | billows for the zone's life, fading in 0.6 s and out 0.5 s | Keep. |
| Life Place (Healing spring) | spring zone 4 + 2·n s, pulses 0.35 heal every 0.5 s | drawn for its life, fades in and out | Keep. |
| Earth Place (Geyser) | 0.6 s rumble, then one eruption | rumble for 0.6 s, eruption 2.6 s (scorch fades) | Instant. Keep. |
| Arcane Place (Delayed blast) | 0.6 s fuse, then one blast | fuse for 0.6 s, blast 2.6 s | Instant. Keep. |
| Lightning Place (Strike) | instant hit + surge on water | 0.6 s | Instant. Keep. |
| Glyph / line glyph | armed 0.8 s, then waits until an enemy steps on it; fires its Place spell once | drawn while armed; then whatever its spell draws (a Water glyph now rains for 5 s) | Keep. |
| Lens | until dismissed or recalled | drawn while it exists | Keep. |
| Area: novas (water, fire, cold, arcane, life) | instant disc; water / fire / cold leave a floor of 0.6 r (water 20 s, fire 10 s, ice 16 s) | 1.3 s ring, then the surface | Instant. Keep. |
| Area: Quake | instant + knockdown 0.6 s | 1.3 s | Instant. Keep. |
| Area: Discharge | instant arcs | 0.45 s | Instant. Keep. |
| Area: Shield ring | structure, stands until it breaks or the Shield pool drains it | drawn while it stands | Keep. |
| Rock walls | 25 s + 5 s per extra Earth, crumbling over the last 3 s | drawn for its life, crumbling | Keep. |
| Blink spark (Spark ring Retreat) | spark zone 4 s | drawn for its life, fading | Keep. |
| Floor: water | 20 s | until it ends (no fade) | Keep. A fade at the end would be nice; not done. |
| Floor: ice | 16 s | until it ends (no fade) | Keep (same note). |
| Floor: fire | 10 s | until it ends, fading over the last 0.67 s | Keep. |
| Status: wet | 12 s from a hit; standing in a puddle keeps you wet for 1 s after | drips while wet | Keep. |
| Status: burn | 5 s, 6 dps | flames while burning | Keep. |
| Status: chill / freeze | chill decays 0.25 a second; freeze 3.5 s | frost while chilled, ice while frozen | Keep. |
| Aura (Sigil + Self) | 12 s | drawn for its life | Keep. |

The audit found one effect that broke the rule: the rain. Fire and Frost patches already lasted 10 s and 16 s as burning or frozen ground. Their short opening flourishes (0.9 s and 0.6 s) are only the moment the patch appears. The ground itself is drawn for its full sim life.

## Rain, the numbers

- **Life:** `SHAPES.rainLife` 5 s + `SHAPES.rainPerRune` 1 s per extra Water (2 Water: 6 s, 3 Water: 7 s). The radius is unchanged (`patchRadius` 1.6 + 0.4 per extra rune).
- **On landing:** the spell's full payload hits once, at 0.5 power, as before. Any other elements in it (lightning, arcane, earth) hit only here.
- **Every tick after that:** every body under it gets one plain Water. That puts out burning, soaks them for the full 12 s, and (once, on the first soak) deals an archetype's soak damage, the same as any water hit. Water deals no damage, so a 5 s zone adds no damage over time. The total damage is the same as the old one-shot. The cost is in the setup it makes possible: a soaked target takes double damage from lightning (`wetShockMult`), and soaked targets freeze under a Freeze spell.
- **Every 0.5 s:** the puddle is topped up (`floorDisc` with Water). This also douses burning ground under the rain, and leaves ice as ice.
- **Allies too:** friendly fire is on, so rain soaks allies. That is the point: it puts out a burning partner, and it is also a risk if you have Lightning queued. With the sculpting wand held, the rain spares allies, as any of your harmful spells does.
- Rain is a zone (`ZONE.rain`), so it rolls back with the rest of the world state. The golden hash is unchanged: the scripted run never casts plain Water Place.

## Trade-offs

- **Rain is now a real setup tool:** 5 s of guaranteed wet in a spot. With a partner's chain lightning it is strong. That is the co-op combo we want, but watch it in the balance pass.
- **Readability:** the cloud stays over the spot for its whole life, so it is clear where the soak zone is and when it ends (the cloud fades out over the last 0.4 s).
- **No extra input:** the cast is unchanged. Only what it leaves behind changed.

## Open

- Should the water and ice floors fade at the end, as fire does? Right now they pop out.
- Should more Water make a wider rain rather than a longer one? Right now it does both a little (+0.4 u radius, +1 s per rune).
