# 2026-11-07: Rune scaling audit — what each extra rune buys

The user: "Can you do an audit of how spells scale with additional runes? It would also be helpful if this information is available in the help (F2) menu."

## How it was measured

`npm run scaling` (`game/tools/scaling.balance.ts`) casts each damaging or healing form (Fire, Cold, Water, Lightning, Arcane, Earth, Life) as Force, Area and Place, with 1 to 5 runes of itself. Each cast goes at one sturdy dummy and at a pack of 5. Channels are held for their natural duration, and rocks are fully charged. Burn, burning floors and springs are counted for 15 s after the cast. The audit also tries every legal second rune: double up, or mix in another element. Results go to `game/tools/scaling-report.json`. Each step also records the reach the help panel states and its "+1 rune" line, so the panel and the measurements are checked against each other.

Costs, for reading the tables:
- **A rune** is about one second of the shared regen budget (R = 1 rune/s across all pools).
- **Wind-up** grows by only 0.04 s a rune. Channels run 2.5 s free whatever their size; a beam's runes extend that.
- So **the real price of an extra rune is the rune**, not time. "Per rune" below is damage per rune spent.
- Pools hold 4 (Fire 5), so in play the ladder stops at 4 for everything but Fire.

## The ladders (after this audit's fixes)

Damage on one dummy (healing for Life), at 1 / 2 / 3 / 4 / 5 runes. Then the growth from 1 to 4 runes, and damage per rune.

| Spell | 1 / 2 / 3 / 4 / 5 | 1→4 | per rune, 1 → 4 | Reach, 1 → 4 runes |
|---|---|---|---|---|
| Flamethrower | 36 / 42 / 46 / 49 / 52 | 1.4× | 36 → 12 | 4.5 → 6 u, cone +75 % |
| Fire ring | 84 / 87 / 89 / 90 / 92 | 1.1× | 84 → 23 | 3 → 4.8 u |
| Fire patch | 81 / 82 / 94 / 94 / 95 | 1.2× | 81 → 24 | 1.6 → 2.8 u, 10 → 16 s |
| Frost spray | 13 / 17 / 21 / 24 / 26 | 1.9× | 13 → 6 | 4.5 → 6 u |
| Frost ring | 5 / 7 / 9 / 10 / 11 | 2.0× | 5 → 2.5 | 3 → 4.8 u |
| Water spray / Splash / Rain | no damage | — | — | 4.5 → 6 u / 3 → 4.8 u / 1.6 → 2.8 u, 5 → 8 s |
| Lightning arc | 60 / 102 / 144 / 171 / 209 | 2.8× | 60 → 43 | jumps 2 → 5 |
| Discharge | 8 / 14 / 19 / 25 / 30 | 3.1× | 8 → 6 | 5 → 8 u |
| Lightning strike | 12 / 20 / 29 / 37 / 46 | 3.1× | 12 → 9 | — |
| Arcane beam | 40 / 80 / 119 / 158 / 198 | 4.0× | 40 → 40 | 13 → 16 u, lasts 2.5 s a rune |
| Arcane nova | 16 / 27 / 38 / 50 / 61 | 3.1× | 16 → 12 | 3 → 4.8 u |
| Arcane blast | 16 / 27 / 38 / 50 / 61 | 3.1× | 16 → 12 | 2.4 → 3.6 u |
| Rock | 22 / 60 / 109 / 163 / 223 | 7.5× | 22 → 41 | — |
| Earthquake | 22 / 62 / 114 / 176 / 246 | 8.0× | 22 → 44 | 4 → 5.8 u |
| Geyser | 29 / 81 / 149 / 229 / 320 | 8.0× | 29 → 57 | 1.3 → 2.5 u |
| Life beam (heal) | 35 / 70 / 104 / 138 / 173 | 4.0× | 35 → 35 | 13 → 16 u, lasts 2.5 s a rune |
| Healing ring (heal) | 14 / 28 / 42 / 56 / 70 | 4.0× | 14 → 14 | 3 → 4.8 u |
| Healing spring (heal) | 59 / 157 / 294 / 470 / 686 | 8.0× | 59 → 118 | 1.8 → 3 u, 6 → 12 s |

On the pack of 5, the areas multiply by about 5: a 4-Earth quake deals 880 and a Fire ring 450. Lightning arcs gain the most from their extra jumps: a second Lightning makes the arc ×2.2 on the pack, against ×1.7 on one target.

## What it says

1. **There are three tiers.**
   - *Going all-in pays* (damage per rune rises): Earth (n^1.5) and the Healing spring (more healing per pulse and more pulses: n × (4 + 2n)).
   - *Fair* (per rune about flat): Lightning, Arcane, the beams, the Healing ring.
   - *Stacking barely pays* (per rune falls): Fire, Cold and Water, where an extra rune mostly buys reach.

   This matches the decided curves ("sprays with the square root, rocks with n^1.5, beams last longer, the rest +70 %"). It also matches the spring's "+2 s a rune" (2026-11-05 decision).
2. **Fire is a mix-in, not a stack.** A Fire rune's value is its Burn (6/s for 5 s), and the burning floor it leaves. Neither grows with more Fire. Only the direct hit does, on the √n curve. So:
   - a second Fire adds +16 % to a Flamethrower and +3 % to a Fire ring;
   - one Fire mixed into anything else adds ×2 to ×6 (Lightning discharge ×5.4, Arcane nova ×6.3, Earthquake ×4.8).

   That is Magicka-like and a real choice ("one Fire, always"), but more Fire buys only size.
3. **Cold stacks for its Chill, not its damage.** Chill grows +0.6 a rune, so 4 Cold reach 2.4 of the 3 that freeze. A pool of 4 means no single Cold spell freezes outright; Water first does.
4. **Water's extra runes buy only size and time.** Pure Water deals no damage. Its spray and splash now push harder with each rune (see the fixes).
5. **Pools cap the top of every ladder at 4** (Fire 5). The fifth rung only exists for Fire, or with Survive's Deep power-ups.
6. **Some extra runes change nothing but the wind-up.** With the panel's +1 line these are now visible: more Fire in a Fire aura, more Lightning in Haste, more Arcane in Glass cannon. Auras not growing was decided on 2026-11-05 ("the aura doesn't grow"). The panel says "+1 FIRE: NOTHING MORE, WIND-UP +0.04S" so nobody spends a rune expecting more.

## Bugs found, and fixed (built on the recommendation)

- **Ice shards: each shard hit at 0.3 × its index.** In `fireSpell` the loop's `k` shadowed the cast's scale, so the outermost shard did nothing and the far side did 1.5×. The volley also grew with the square of the shard count, and turrets, Echo and the Double couldn't scale it. Now every shard flies at `SHAPES.shardPower` (0.75) of the payload, times the scale. A full 6-shard volley lands the same 4.5× as before, and more shards add linearly.
- **Arcane nova and blast ignored extra Arcane.** `formCurve` returned 1 for Arcane in every form. That was meant for the beam ("beams last longer instead of hitting harder"), but it also flattened the nova and the blast, whose extra Arcane bought only radius. Now Arcane is on the +70 % rule like Lightning. Beams pass a new `flatForm` hit option, so a beam's form element counts once whatever the element.
- **The Life beam grew with n².** Healing skipped the form curve, so each Life added healing per second *and* 2.5 s of time: a 4-Life beam healed 553 where a 4-Arcane beam dealt 158. With `flatForm`, Life buys time like Arcane, and the beam now heals 35 a rune.
- **Pure Water never pushed**, though the rules say "A cone that soaks and pushes" and "A splash that pushes everything away from you". Push only came from Water as a mixed-in shape change (Water beam, Water nova). Now Water's own spray and splash carry Push too (6 u/s a Water rune; the spray at the channels' status rate). Rain, steam and ice don't push.
- Golden hash `20427aa5` → `2f804c92` for these four changes. Chrome and node agree.

## The help panel (F2)

With numbers on (Shift+F2), every spell row now has a pale-blue line under its stats: what one more rune of the spell's lead element would change.
- Damage and healing are a ratio; the rest are differences. Example: "+1 FIRE: DMG ×1.22, RADIUS +0.6U, WIND-UP +0.04S".
- The lead is the form, or for Shield and Sigil spells the element they carry, since another Shield or Sigil only changes the kind.
- The line says so when the queue is full ("QUEUE FULL: 5 RUNES IS THE MOST"), when the rune would cancel ("SHIELD CANCELS SHIELD"), when it would make another spell ("BECOMES ..."), and when the pool can't hold another ("(A COLD POOL HOLDS 4)").
- The panel's numbers now come from one function (`spellNumbers` in `help-model.ts`) that mirrors the sim. The audit reads its reach column from it.

Writing it fixed several numbers the panel had wrong:
- the arc showed 10/s per Lightning, but it does 25/s (0.5 a zap every 0.2 s);
- the beam's range and free time didn't grow;
- the spray's range didn't grow;
- the geyser's 1.3× was missing;
- the spring showed one pulse as its healing.

Statuses are shown too: Burn's fixed 6/s for 5 s, Chill and Stun per hit, and Push. So are Ice shards' full volley, orbitals' per-orb hit, a turret's shot cost, a weapon's per-blow elements, and auras' regen, chill and shove.

`?helpstats=1` turns the numbers on for screenshots.

## Open questions (recommendations built or kept as marked)

- **q-1 Fire stacking.** Keep it as it is: Fire is the mix-in, and extra Fire buys size (recommended, nothing built). Or let each extra Fire lengthen the burn by 1 s, so stacking pays a little.
- **q-2 The Healing spring's n × (4 + 2n).** At 4 Life it heals 470 over 12 s, the steepest curve in the game. Keep it (recommended: the user chose "extra Life heals by lasting longer", and healing caps at max health, so the curve only shows in a group). Or make Life only add time.
- **q-3 Ice shards' power.** The fix kept the full volley's total. A volley that lands only its centre shards now does a little less than the old centre shards did. Re-tune after play if they feel weak.
- **q-4 Auras that don't grow** (Fire aura, Haste, Glass cannon). Keep (decided 2026-11-05). The panel now says so.
