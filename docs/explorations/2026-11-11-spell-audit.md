# 2026-11-11: Spell audit, pass 1: the shape of what exists

The user: "I want to make a pass over all the spells in the game and see if the effects make sense and are reasonably balanced… work with me like a game designer." Claude drives the audit; the user decides. Pass 1 (this page) inventories what exists and flags problems. Pass 2 decides, family by family.

## The audit's principles (agreed 2026-11-11)

1. **Distinct elements earn power** (complexity). Rune count earns power too, but through cost, not complexity. Finger travel matters little. Treat 3 runes of one element and 3 different as about equally costly (the regen floor may change); if anything, mixing lets shallow pools burst more.
2. **Channels are a little weaker**, in value per rune or peak, not in feel. Upkeep exists so a channel can effectively recast itself as a convenience.
3. **Aim earns power.**
4. **Close range earns power.**
5. **Friendly fire discounts AoE, by shape:** an Area around you is risky, a Place at range much less so. Balance for co-op, 2–3 players the sweet spot; solo AoE is stronger, but solo has no support.
6. **Nothing feels underpowered; strong is fine, dominant is not.** A discovered strong strategy is fun; one that makes other runes pointless breaks pillar 2.
7. **The rune is the price,** at the pool sizes players have (about 4 now, from 1 early in the campaign). Wind-up is more than the in-game number: complex presses are slower for the player too.
8. **Each element intensifies along its own axis** in spells, with a primary and secondary effect. Don't force it on every archetype (too bland). Every rune should add some damage unless it adds strongly to something else.
9. **The "name the situation" test:** for every rune you could add, name the situation where it's the best addition.
10. **Setting up a partner counts:** a solo floor plus a co-op ceiling.
11. **Niche answers are judged in their niche** (reference situations, not a dummy chart).
12. **Every cast shape has a job.**
13. **Today's enemies are early drafts** (the user: many more will come). Balance against reference situations (one tough target, a pack, a fast flanker, an ally nearby), not the current roster. Systemic problems (a status that locks anything) are fixed in the rules, not left for enemy design to patch. Body-scaled pools and resistances are the tools future enemies use to differ, and a spell with a clear identity but no use yet can be given its situation by a future enemy.

## What was audited

The game as it will be: `worktree-spell-audit` merges `worktree-spray-vfx` (channels pay upkeep per rune, beams buy power, one missile speed of 20, bigger and longer Place, freezing fog, the burst grows like the nova; Earth's burst a line, Lightning's forks) and `worktree-ice-element` (Ice is a Water + Cold rune and its own form: 9 damage a rune, half Cold's chill, fast shards, spike walls, the Ice bow). Golden hash `bd89da22`. Atlas: 43 cells (form × cast), 944 distinct spells, 0 inert additions by the rules' own count.

A probe (`game/tools/probe.balance.ts`, `npx vitest run --config vitest.balance.config.ts tools/probe.balance.ts`) casts any queue at 135-HP bodies (health restored each tick) at 3 u (Force), 1.6 u (Area) or 4 u (Place), one target and a pack of 5, dry and wet. Channels are held their free 2.5 s, rocks fully charged, burn counted for 5 s after. It records damage, **seconds denied** (stunned, frozen or knocked down, when an enemy can't act: `enemies.ts canAct`), mean chill and distance moved. Report: `game/tools/probe-report.json`.

## Selected numbers (one target; per target in a pack; seconds denied)

| Queue | Spell | Dmg | Pack/target | Denied | Note |
|---|---|---|---|---|---|
| F / FF / FFF | Flamethrower | 42 / 54 / 63 | 32 / 40 / 46 | 0 | |
| F / FF / FFF | Fire ring | 36 / 53 / 70 | same | 0 | wet: 12 (fire only dries) |
| F / FF / FFF | Fire patch | 24 / 26 / 28 | same | 0 | extra Fire buys size only |
| C / CC / CCC | Frost ring | 8 / 14 / 19 | same | 0 | chill 0.07 / 0.22 / 0.39 |
| C | Frost spray / Freezing fog | 13 / 15 | | 0 | chill ≈ 0.05 |
| W, WW | Water spray | 0 | | 0 | push 2.2 / 3 u |
| WF / WFF | Scalding spray | 35 / 21 | | 0 | **more Fire, less damage** |
| L / LL / LLL | Lightning arc | 60 / 102 / 144 | 31 / 69 / 121 | **2.7 / 3.1 / 3.4 of ~2.9 s** | wet: 120 / 222 |
| LF / LFF | Flame arc | **159 / 219** | 84 / 119 | 2.7 | the strongest 2-rune spell on one target |
| L | Discharge / Strike | 8 / 12 | | 0.33 | discharge hits allies within 5 u |
| A / AA / AAA | Arcane beam | 40 / 67 / 93 | 8 (single target) | 0 | reach 30 |
| A | Arcane nova = Arcane blast | 16 = 16 | | 0 | same numbers, blast at range |
| AF / AL / AC / AW | Arcane beam + 1 | 91 / 64 / 52 / 39 | | 0 / **2.5** / 0 / 0 | AC chill 0.05 |
| AFW | Steam beam | 73 | | 0 | Water in a fire spell removes the burn |
| I (W+C, 2 runes) | Ice shards / ring / sheet | 14 / 9 / 5 | 5 / 9 / 5 | 0 | sheet freezes the wet |
| II (4 runes) | Ice shards | **11** | 7 | 0 | **less than one Ice at 3 u** (wider fan) |
| IL / ILL | Ice shards + Lightning | 29 / 44 | | 0.33 / 0.68 | |
| E / EE / EEE | Rock | 22 / 60 / 109 | 4 / 12 / 22 | 0.58 | |
| E / EE / EEE | Earthquake | 22 / 62 / 114 | same | 0.58 | around you |
| E / EE / EEE | Geyser | 29 / 81 / 149 | same | 0.58 (EEE: 4.2, to check) | at range, stronger than the quake |
| EF / EEF / EFF | Fireball | 50 / 97 / 61 | | 0.58 | EEF ≠ EFF already |
| EA / EEA / EAA | Arcane boulder | 37 / 74 / 51 | 16 / 33 / 23 | 0.58 | |
| EC / ECC | Frost boulder | 28 / 33 | | 0.58 | chill 0.04 / 0.13 |
| EI | Ice boulder | 51 | | 0.72 | 3 runes |

## What pass 1 found

1. **Lightning channels are a stun-lock.** Every hit with Lightning stuns, and a stunned enemy can't act. The arc zaps every 0.2 s for 0.35 s of stun, and a beam's per-tick stun is refreshed every tick. So any channel with one Lightning rune locks its targets for its whole length: the arc up to three of them, auto-aimed. With Fire, the Flame arc is also the top damage for 2 runes. It breaks principles 2, 3 and 6 at once, and stun's "+0.35 s a rune" means nothing in a channel.
2. **Fire is the default mix-in.** One Fire multiplies damage ×2.3–2.7 in any form (burn pool). Against it, Cold adds ×1.2–1.3 and almost no chill, Water nothing, Arcane ×1.7. "Always add one Fire" fails the "name the situation" test for the others: only wet targets, fire-immune enemies and the Lightning stun beat it.
3. **Cold doesn't deliver its identity.** The essence says "the biggest crowd control", but as a payload one Cold adds about 0.05 chill (5 % slow). Only stacked Cold (CCC) or a freeze does real CC. Cold as a payload is the weakest second rune everywhere.
4. **Ice is costly and weak for its runes.** One Ice is two runes (Water + Cold), yet its 1-Ice spells deal 14 / 9 / 5, below 1-rune Fire. At 3 u, a second Ice *lowers* the shards' damage (the fan widens past the target). Its identity (damage, quick flight, spikes) isn't in the numbers yet.
5. **Range is rewarded over risk.** The Geyser (Place, at range) out-damages the Earthquake (Area, around you, hits allies), and the Arcane blast equals the Arcane nova. Principles 4 and 5 say the close, risky shape should be the stronger.
6. **Water + Fire costs damage.** Water in a fire spell removes the burn, so Steam is always a damage downgrade (Scalding spray 35 < Flamethrower 42; WFF 21; Steam beam 73 < Fire beam 91). Its mist that hides allies is its only reason, and that's untested.
7. **Inert or near-inert extra runes:** extra Fire in a Fire patch (24 → 28: size only); a second Ice in shards (negative at range).
8. **Weak shapes:** Lightning's Area and Place (8 and 12 for a rune), Frost ring (8), Ice sheet (5), Rock at 1 rune (22 for a 1.4 s charge, which matters while pools start at 1).
9. **What works:** Earth's mixes already differ by order (EEF 97 vs EFF 61: mass against heat), as the user's principle wants. The Arcane beam is the clean single-target aimed channel. Earth knockdown gives every Earth spell 0.6 s of denial, a fair secondary.

Not yet measured: Life (heals and their lending), Shield, Sigil, Self casts, weapons and guards. They come with their own families in pass 2.

## Pass 2 order (proposed)

1. Element identities and intensity axes, including the status model (stun in channels, chill as payload, burn as the universal mix-in), since findings 1–3 are about them.
2. The spray elements: Fire, Cold, Water, Steam.
3. Ice, against Cold and Water.
4. The body forms: Lightning, Arcane, Earth (and Area against Place).
5. Life. 6. Shield. 7. Sigil. 8. Cross-cut by cast.
