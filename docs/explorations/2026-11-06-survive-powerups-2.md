# Survive power-ups, pass 2: the Maybes (2026-11-06)

This pass follows `2026-11-05-survive-mode.md`. The user rated four power-ups **Maybe** on the Survive Review and wrote notes on each, then cut Bloom. This doc records those notes and the redesigns. All four redesigns are built (`game/packages/sim/src/survive.ts`, `PERKS` in `config.ts`). Bedrock, Pyre, Mirror charm and Glass heart are unchanged (all Keep). Wellspring, +1 to three, Deep, and +1 Shield and +1 Sigil were reworked the day before and aren't touched here.

## What the user said, and what changed

### Echo
> "This sounds weird, is this just equivalent to 'you have a free sigil rune'? Sounds very weak. Are you picking this as a tradeoff between a permanent upgrade? If so, I'd expect the implementation to be more like 'be super powerful for the next wave, at a long term weakness', good at key waves." … "Definitely using half the runes is super duper weak (why not just cast it yourself)." … "No don't lose a rune. The permanent weakness is about the opportunity cost of not picking another thing."

**Was:** a free Double for one wave. It repeated your spells at half power for half their runes, and enemies went for it.

**Now:** from the pick until the next wave is cleared, **every spell you cast goes off a second time, free, 0.4 s later** (`PERKS.echoDelay`). The echo fires from where you stand then, along your aim then.
- **What echoes:** one-shot spells (bolts, rocks, shards, novas, patches, rain, springs, strikes, blasts, geysers, discharges, the imbued burst) go off again whole, with the same charge. A beam or a spray gets a second beam or spray from your staff that trails your aim by 0.4 s, so it sweeps behind yours and catches what yours just left. An arc zaps a second time after each zap.
- **What doesn't:** walls, wards, devices, weapons and guards, Blink and Self casts. Echoing them would double what *stands*, not what *happens*: two turrets for one, or a ward that can't be taken off. That's a different power-up.
- **Key waves:** Echo is `PERKS.echoKeyWeight` = 3 times as likely to be on an altar before a key wave (`keyWave`: the 5th and the 8th of every eight, the first brute and "everything at once"). The pick already shows the next wave's portals and mix, so a player can see why Echo turned up.
- It can still be picked again at later altars (cap 9). It still ends when the wave is cleared, and a repeat that is still on its way is dropped.

**In the hands:** you cast as usual, and a beat later the same spell goes off again with a violet ring at your feet. Because the echo follows your aim, a quick turn sends it at a second target. That's a small skill to learn: cast, turn, let the echo land on the next foe. The strip reads "ECHO: YOUR SPELLS GO OFF TWICE" for the whole wave.
**What a partner sees:** twice as many spells from you, including the friendly fire. A Fire spray's echo burns your partner too.
**Measured** on a dummy, with runes plentiful, over 10 s of the same cast: a rock deals 2.0× the damage, a beam 1.86×, a fireball 1.77×, a Fire spray 1.46×. Burning refreshes rather than stacks, and the spray's echo starts 0.4 s late.
**Cost:** a wave's worth of power instead of a permanent upgrade, as the user asked. There is no rune cost and no lost rune.

### Long fuse → Lingering
> "I like the idea of leaning into some effects, but I don't know if this quite works. Glyph delay doesn't seem like a big deal… I could maybe see a version that improves glyphs, and things like fire walls, or other sort of persistent area effects?"

**Lingering** (new slug, `pu-lingering`, cap 1): everything you place or leave lingering lasts **1.5× as long** and is **1.25× as wide** (`PERKS.lingerLife`, `PERKS.lingerSize`). That covers:
- Place patches and the floors they leave (burning ground, frost, ice, water) and steam;
- Rain, the Healing spring, and the floor a nova leaves (the nova itself stays instant);
- rock walls, with any coat, so a Fire wall burns 1.5× as long. With Bedrock a wall stands 3× as long;
- glyphs: the trigger ring is 1.25× as wide and the patch the glyph casts is the bigger one. The arming delay is unchanged, because the user said that part didn't matter.

Auras are not included: they sit on you, not on the field (Q15 asks). Instant blasts stay instant.
**Cost:** it only matters if you place things. Your burning ground and walls are bigger obstacles for your partner too.

### Quickstep
> "I'm not actually quite sure how recovery works in the game, but I don't think it should be long enough that this is a thing you really crave. I think slowness comes more from being rune constrained. If you want to be more snappy, throw on a haste (… it should probably reduce recovery as well). This could maybe work as a permanent haste."

- **Haste checked:** the Haste aura (Sigil + Lightning on yourself, ×1.4) sped up walking and wind-up but **not recovery**. It now shortens every recovery by the same factor: spell recovery, a Strike's follow-through, Heavies and Specials (`cast.ts toRecovery`). Retreat's fixed 0.5 s guard cooldown is unchanged.
- **Quickstep** (`pu-quickstep-v2`, cap 2) is now **a permanent, weaker Haste:** +15 % per stack (`PERKS.quickstep`) to walking, wind-up and recovery. It multiplies with the aura (`hasteOf`).
- **Measured:** with runes plentiful, spell damage barely moves (+0–2 %), which confirms the user's read that casting is rune-bound. A staff Strike spam gets +20 % (+27 % at two stacks), and you walk 15 % further. So it's a mover's and a weapon-user's pick, small enough to keep pillar 4.

### Clockwork
> "way too powerful with 4 rune turrets. I could see some cost reduction, but this would be crazy strong. Even with one rune turrets it's a lot of extra DPS."

**Was:** free shots at the full rate, outside the regen budget.
**Now** (`pu-clockwork-v2`): **your turrets bind no Sigil rune.** They still cost their runes to cast, and their shots still cost half their payload inside the shared budget (all your turrets together spend at most 13 % of your regen R). A second turret therefore splits the first one's fire: you get more coverage for about the same damage. The point is room: on Survive's single Sigil rune you can keep a turret, a glyph and an aura up at once. Dismissing a Clockwork turret gives no rune back, and pressing Sigil with none free never recalls one, since recalling it would free nothing.
Q14 offers the two other modest options: a turret costs one rune less to cast, or its shots cost a quarter of the payload instead of half (about +50 % turret damage).

## Bloom's replacement (proposed, not built)
> "I like the idea of a heal tweak, but I don't know if this one would actually be useful."

Bloom splashed heals onto nearby allies. It was rarely useful because heals already cover areas (springs, Healing rings). A support pick should reward the skill the vision asks about, *what makes support skillful*, and that skill is timing and attention, not volume. Three candidates:
1. **Triage (Claude's pick):** your heals on another wizard below 35 % health heal double. It does nothing while everyone is healthy, and it makes the clutch save land. It's on the review page as a Designed card (`pu-triage`).
2. **Last breath:** an ally you healed in the last 3 s who would go down is left at 1 HP instead, once per ally per wave. It's strong and readable, but it can feel like a rule you fight against.
3. **Long reach:** your Self heals and wards land on an ally up to twice as far from the cursor. It's quality of life, not a pick anyone builds around.

## Trade-offs, named
- Echo doubles friendly fire along with everything else, so Pyre plus Echo near a partner is dangerous.
- Lingering makes the zones *you* placed bigger obstacles for your partner, and for your own beams (rock walls).
- Quickstep adds no finger complexity and almost no spell speed; it's a feel pick.
- Clockwork's power is mostly in the Sigil economy, so it's subtle on the card. The rule text says it plainly ("Your turrets bind no Sigil rune").

## Open questions (on the Survive Review)
- **Q12** Echo: one wave per pick (built) or every wave?
- **Q13** Echo and key waves: ×3 more likely (built), only before key waves, or even odds?
- **Q14** Clockwork: no Sigil binding (built), −1 rune off a turret, or quarter-cost shots?
- **Q15** Lingering: placed things only at ×1.5 / ×1.25 (built), include auras, or bigger numbers?
- Triage: rate the Designed card.
- Q11 (whether the Double's repeat is free) is moot.
