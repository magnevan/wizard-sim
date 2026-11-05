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

*(Both answered the same day; see the follow-up below.)*

## Follow-up: consistency audit

Same day. The user answered the two open questions:
- **Floors:** water and ice should fade out at the end, as burning ground does.
- **Rain:** "Maybe both": more Water makes it wider *and* longer.

Then the user asked: "Is there some other effects we should look at for consistency?" This section is that audit, in three parts:
- (a) whether everything that lingers fades out on screen;
- (b) how extra runes scale each Place and Area effect;
- (c) whether any effect is drawn for a different time than it lives in the sim.

### What changed

- **Floors fade over their last second.** Water and ice now dither away in six steps over their last 1 s, instead of vanishing. Fire's flames used to shrink over the last 0.67 s while its dark base popped out under them. Now the flames shrink and the base dithers out over the same 1 s. All of it is in `client/src/art/vfx.ts` (`FLOOR_FADE`, `floorFade`).
  - Once a floor is gone, the marks it leaves (a damp patch, a wet sheen, a scorch) still fade slowly, as before. So water now goes puddle, thinning puddle, damp patch, nothing.
  - Rain tops its puddle up every 0.5 s, so the puddle under falling rain never starts to fade.
- **The Blink spark fades out.** It used to dim over its 4 s but end with its ring still at half strength, then pop. Now it fades fully over its last 0.5 s (`view-structures.ts`, `sparks`).
- **Rain is wider and longer per extra Water.** This was already the case and is kept: +0.4 u radius (the same step as every Place patch) and +1 s per extra Water. Two Water gives a 2.0 u, 6 s rain; three gives 2.4 u, 7 s. A test now pins the radius too. The Atlas cell now says so ("Each extra Water makes it a second longer and a little wider").

No sim numbers changed, so the golden hash is unchanged (`dda18ae2`).

### (a) Does every lingering thing fade out?

| Thing | How it ends on screen | Verdict |
|---|---|---|
| Rain | the cloud fades over 0.4 s; the last drops land as it ends | ok |
| Steam cloud | the billows shrink and fade over 0.5 s | ok |
| Healing spring | fades over 0.5 s | ok |
| Delayed blast, geyser | instant: the fuse ends in the eruption, which plays 2.6 s with a fading scorch | ok |
| Blink spark | **was:** popped at half strength. **Now:** fades over 0.5 s | fixed |
| Floor: water, ice | **was:** popped. **Now:** dither out over 1 s, then the damp/sheen mark fades over 5–6 s | fixed |
| Floor: fire | flames shrank over 0.67 s but the base popped. **Now:** all of it fades over 1 s, then the scorch fades over 40–55 s | fixed |
| Rock wall | crumbles over its last 3 s (the sim drains its health, and the drawing follows its health), then a 3.2 s crumble | ok |
| Energy wall, curtain | breaks with a 0.7 s shatter when the Shield pool drops it | ok (a break, not a fade, and it reads as one) |
| Turret, lens, glyph | 0.7 s fade when dismissed or replaced. A glyph that triggers plays its spell. An orbital's last charge ends in its strike | ok |
| Ward | 0.7 s `wardoff` | ok |
| Aura | fades over its last 0.5 s | ok (dismissing it with Esc cuts it at once, which fits a deliberate dismissal) |
| Double | 0.6 s `dblgone` | ok |
| Burning | the flames halve for the last 0.33 s | ok |
| Wet | the tint halves for the last 0.5 s, and the drips stop | ok |
| Chill, freeze | chill scales with its amount as it decays; ice thaws in steps | ok |

### (b) How extra runes scale each Place and Area effect

*n* is the number of runes of the spell's lead element (its form). "Strength" means the payload: every rune adds damage, heal or status through the normal per-element curves, whatever the shape.

| Effect | Size per extra lead rune | Duration per extra lead rune | Strength |
|---|---|---|---|
| Nova (Area) | radius 3 **+0.6** | instant; leaves a floor ring of 0.6 r at the floor's fixed life | payload |
| Quake (Area) | radius 4 **+0.6** | instant | payload |
| Discharge (Area, Lightning) | reach 5 **+1.0** | instant | payload |
| Fire / Frost patch, Ice sheet (Place) | radius 1.6 **+0.4** | **none** (fire 10 s, ice 16 s) | payload (a 0.5 power hit on landing) |
| Steam cloud (Place) | radius 1.6 **+0.4** | **none** (6 s) | payload, pulsed at 0.25 |
| Rain (Place) | radius 1.6 **+0.4** | 5 s **+1 s** (+20 %) | payload once on landing, then plain Water |
| Delayed blast (Place, Arcane) | radius 2.4 **+0.4** | instant (0.6 s fuse) | payload |
| Geyser (Place, Earth) | radius 1.6 **+0.3** | instant (0.6 s fuse) | payload ×1.3 |
| Healing spring (Place, Life) | radius 2.1 **+0.3** | 6 s **+2 s** (+33 %) | pulses 0.35 of the heal |
| Strike (Place, Lightning) | fixed 0.9 | instant | payload ×1.2 |
| Rock wall | fixed shape | 25 s **+5 s** per extra Earth (+20 %) | health +40 a rune |
| Energy wall, ward | fixed shape | until the pool drops it | health +20 a rune |
| Aura (Sigil + Self) | **fixed** 2.5 u | **fixed** 12 s | its elements' counts |

Where the rules disagree:
1. **Radius step:** Place grows +0.4 u a rune, except the geyser and the spring, which grow +0.3. Area grows +0.6, except Discharge, which grows +1.0.
2. **Duration:** some lingering things grow (rain +20 %, rock +20 %, spring +33 %) and some don't (steam, the floors a patch leaves, the aura).
3. **What the lead rune buys:** on most shapes it buys size, on rain both size and time, on the spring mostly time.

### (c) Drawn life against sim life

No effect is drawn for a different time than it lives in the sim, apart from the pops fixed above.
- Rain, steam, the spring and the spark are drawn straight from their zone's remaining life.
- Glyphs draw their arming from the device timer.
- Rock walls draw their crumble from the health the sim drains. That covers Bedrock too, which doubles the life.
- The short opening flourishes (the fire patch's 0.9 s ring, the frost sweep's 0.6 s) and the aftermath of instant effects (the quake's 1.3 s ring after a 0.6 s knockdown, the eruption's 2.6 s scorch) are deliberate. They mark a moment; they don't stand for a lasting effect.

### A proposed consistent rule

> **More of the lead element makes it bigger, and if it lingers, longer. Every rune adds strength.**
> - Size: Place +0.4 u a rune, Area +0.6 u a rune.
> - Time: a lingering effect lasts +20 % of its base life per extra lead rune.
> - Strength: the payload, as now.

Rain and rock walls already follow it. Building the rest would change balance, so it is listed as open questions below, not built.

### Open (with Claude's recommendation)

1. **Geyser and spring radius: +0.3 to +0.4 a rune?** It's a small buff to big Earth and Life placements. *Recommend: yes.* It's the cheapest step toward one rule, and the player can't tell 0.3 from 0.4 apart anyway, so one number is easier to tune.
2. **Discharge reach: +1.0 to +0.6 a rune?** It's a nerf to stacked Lightning: 4 Lightning reaches 8 u now, 6.8 u under the rule. *Recommend: no, keep +1.0.* Discharge is a self-centred zap with no floor or lingering part, and its long reach is what makes stacking Lightning on yourself worth it. Count it as the one Area exception.
3. **Spring life: +2 s to +20 % (+1.2 s) a rune?** It's a heal nerf: 4 Life gives 9.6 s instead of 12 s. *Recommend: no, keep +2 s.* A spring's pulse strength is fixed per pulse, so Life buys healing through time. Shortening it would make stacked Life less useful than other stacks, which is the opposite of the inert-addition goal.
4. **Steam life: +20 % a rune (6 s, 7.2 s, 8.4 s...)?** It's a small buff. *Recommend: yes.* Steam is the one lingering zone whose life ignores your runes, so stacking the lead into it buys size only.
5. **Floors left by a Place patch: +20 % a rune** (fire 10 s, 12 s, 14 s; ice 16 s, 19.2 s...)? It's a buff, and it would mean a floor cell's life depends on what made it, not only on its kind. Nova rings would keep the fixed life. *Recommend: yes, Place patches only.* "More Fire burns longer" is what a player expects. Fire already lasts 10 s, so watch it in the balance pass.
6. **Aura: grow with Sigil?** *Recommend: no.* The aura's strength already scales with its elements, and Sigil is capped at 3, so the room is small. Leave it fixed.
