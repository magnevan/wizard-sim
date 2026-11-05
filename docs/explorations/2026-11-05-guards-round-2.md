# 2026-11-05: Round-2 ratings on weapons and guards, and how elements mix

Follows `2026-11-05-guards.md`. The user rated round 2 of the Weapon Moveset Review. Following "build optimistically", everything below is built into the game and shown as round 3 of the same review page. The mixing section at the end is a proposal and is not built yet.

## What the user said, and what changed

| Item | Rating and note | Change (built) |
|---|---|---|
| Bulwark Retreat (Brace) | cut: "keep the space creating effect, but maybe it's a step back plus a kickback on enemies". Also answered q-brace = shove | **Shove step:** a 1.5 u step back while the slab slams forward. Enemies within 2.6 u in front are knocked back and stunned for 0.6 s, which opens about 3 u of space. Anchored (no knockback) stays |
| Mirror buckler | keep, "feels a little weak compared to others"; Retreat "2 units is a little short" | Backstep is **3 u**. A normal block **glances** a shot off to the side and doesn't wear the buckler down; the parry still reflects. HP 70 → 90 |
| Rime Defend | maybe: "people hitting you get chilled which slows them down? I don't want too many accidental ground effects" | The block **chills melee attackers** (1 chill stack per hit). It no longer frosts the floor. The parry still freezes |
| Tide shield | maybe: "Always wet means you can't cast lightning? That sounds pretty bad" | The passive is **Quenched:** you can't burn. You're no longer kept wet. The weakness to lightning damage (−50 %) stays |
| Prism Defend / card | maybe: "the active block seems a little meaningless"; "maybe too beam specific" | The passive is now **Clear:** your allies' beams and sprays don't hurt you, from any side, so a partner can beam through you. The frontal half-beam passive is gone, so raising the block (it stops beams and sprays from the front, and a parry returns them) is the only frontal protection |
| Leaf Defend | maybe: "very situational to have that positioning" | The block heals **allies around you** (3.5 u, any side). The parry burst-heals all of you, you included |
| Leaf Retreat (Regroup) | maybe: "What if there's no ally? Feels a little weird" | **Seed step:** a 2.5 u hop back that leaves a healing bloom where you stood (radius 1.2, 4 s). It works with or without an ally. Like the Life spring, it heals anyone standing in it, enemies too (pillar 3) |
| Echo focus | "I don't really like this version. But making it into a ranged wand is good. Maybe a special around regenerating runes?" Heavy and Special cut | **Arcane wand:** Strike is a light bolt. Heavy is a **charged bolt** that hits harder and pierces when charged at least halfway (2 uses). Special is **Siphon:** hold Shift+RMB and you stand rooted while your runes regenerate 4× as fast, for 1 use a second. The Echo memory, Copy and the half-power echo are removed from the sim |
| Healing hands Special (Sweep) | cut in round 1: "channel healing energy and it heals allies around you while you hold it" | **Mend:** hold Shift+RMB to heal allies within 3.5 u (not you) by 7 hp/s, while you walk at half speed. It costs 1 use a second |
| Javelin | maybe: "ice isn't coming off spear in a natural way. Also 3 uses seems too limiting" | It costs **2 uses** a throw, out of 30. In the game it's drawn as a long ice shaft that peels off the spearhead along the thrust line, shedding frost |
| Healing hands copy | "Signature says two handed, but description says one-handed" | The page text is fixed: there are no two-handed weapons (q-hands) |
| Staff moves | "Can have a little damage, but it's weaker" | Already true: the staff's swings deal 6 damage, against the conjured weapons' payload |
| q-res-when | carried, "but maybe there's some downside to carrying weapons vs nothing. It feels like it should slow you down a little" | **Carrying costs 5 % walking speed each** for a guard and for a weapon. The Bulwark takes another 15 % |
| q-retreat-cost | recovery | Unchanged: Retreat has a fixed 0.5 s recovery |
| q-guard-mix | mix: "a lead maybe still setting the overall moveset? Additional elements mix in some of their passives and traits. But we have to think through it" | First cut built: the second element brings its passive and its whole resistance row at half. The full proposal is below |

Kept as they were: Bulwark Defend, Ember (all of it), Rime Retreat and card, Spark (all), Tide Defend and Retreat, Prism Retreat ("Phasing is cool"), and the round-2 Heavies of the trident, spear, flame sword and maul.

## How elements mix (proposal, not built)

The user: "We should think through more about how elements will mix too." The questions are on the review page, next to their text.

**What the rules already give us.** Opposites cancel in the queue: fire/cold, water/lightning, life/arcane, earth/lightning, and shield/shield. So a guard is Shield plus at most 4 runes of non-opposed elements, with at most 3 different ones. Most conflicting passives can never meet. Warm (Ember) and Sure-footed (Rime) can't share a guard, and neither can Leaf and Prism.

**The problem with today's cut.** Only the second element mixes in, so a third element does nothing. That breaks the user's own rule from play-test note 5: "adding an element can't ever not change the spell".

**Proposal (my recommendation, one rule for guards and weapons):**
1. **The lead sets the moves.** The element with the most runes picks Defend, parry and Retreat (guards), or Heavy and Special (weapons). It's unchanged, and the user agreed with it.
2. **Every other element mixes in its passive and its resistance row** (strengths and weaknesses), scaled by its runes: half at 1 rune, the full row at 2.
3. **Every other element coats the active effects,** the way a weapon's extra runes already ride on its blows. A block bites back with its coat: whoever hits a Bulwark + Fire block catches fire. Parries and Retreat marks carry the coat too, so a Shove step + Fire sets the shoved alight. With this, the Ember thorns and the Rime chill stop being special cases: each is just the lead's own coat. Readability: the guard's rim shows the coat colours, and every bite-back flashes in the coat's colour.
4. **More of the lead makes the shape bigger** (the Life rule): +25 % guard HP and +25 % Retreat distance per extra lead rune. For weapons, +10 uses per extra lead rune.
5. **Weapons' held Specials take the coat:** Mend + Water also washes off burning and freezing, and Siphon + an element refills that element twice as fast.

**Costs.** Coating doubles what a partner has to read: a block that bites back in two colours. Rule 3 keeps it readable by tying each effect's colour to the rim. Scaling by count (rule 4) adds no new input; the queue already counts runes.

**Ties.** Today a tie between equally many runes goes to a fixed element order (earth, fire, cold, lightning, water, arcane, life). That's a hidden rule. Making the first element queued win would be readable, but it needs the queue order stored with the guard. Not asked yet.

### Revision: the strong element leads, as in spells

The user: "Also stronger elements are the ones that need more flexibility, since they set the form."

In the spell rules (`rules-c.js`, `PRIORITY`), the form is never picked by count. The strongest element present wins: Shield, Sigil, Life, Earth, Arcane, Lightning. The element it carries is the material: Earth + Fire is a fireball, Arcane + Fire a fire beam. For guards, Shield is already the form, so the same rule gives:

1. **The lead is the strongest element present: Life, then Earth, then Arcane, then Lightning.** Fire, Cold and Water lead only when no strong element is in the guard, and then by count. This replaces rule 1 above. It also removes most of the hidden tie-break, because the order is the same one players learn from spells.
2. **So the strong guards lead in most mixes, and they're the ones that must flex.** A Leaf, Bulwark, Prism or Spark keeps its moves' shape, but the element it carries becomes their material (rule 3's coat, given a real shape per pairing). The weak guards (Ember, Rime, Tide) only ever mix with each other, so a coat is enough for them.
3. **Opposites cut the pairings down to about 15.** The same rule applies to weapons: Sigil plus a strong lead (healing hands, maul, wand, whip) bends to what it carries.

| Lead | Carries | Proposed material effect |
|---|---|---|
| **Leaf** (Life) | Earth | Seed step leaves a heal-stone that bursts on allies; +HP (the Life lend: heal-stone) |
| | Lightning | The block's heal chains from ally to ally (Chain heal) |
| | Cold | The parry's burst heal flies out as shards that each find a hurt ally (Healing shards) |
| | Fire | Heals also dry and thaw (Healing spray) |
| | Water | Heals nudge allies out of danger and put out burning (Rescue spray) |
| **Bulwark** (Earth) | Fire | The slab glows hot: biters burn, and the Shove step sets the shoved alight |
| | Cold | Biters and the shoved are chilled; a frozen target shoved into a wall shatters |
| | Water | The Shove step is a wave: it shoves further and soaks |
| | Arcane | The slab hits as arcane force and knocks further |
| **Prism** (Arcane) | Fire, Cold, Water, Lightning | A parried beam comes back in the carried element. Phase leaves that element on bodies you pass through |
| **Spark** (Lightning) | Fire | The Blink spark bursts into flame, and the discharge ignites |
| | Cold | The Blink spark chills, and the discharge chills |
| **Ember / Rime / Tide** | each other (Fire + Water, Cold + Water, Water + Fire...) | A coat only: Ember + Water thorns scald (steam); Tide + Cold Surge leaves ice; Rime + Water freezes longer |

Arithmetic, checked against the cancel pairs: Life can't carry Arcane, Earth can't carry Lightning, and Lightning can't carry Water or Earth.

**Cost.** About 15 bespoke pairings to design, draw and keep readable, against the 8 single guards. The Leaf row mostly reuses the Life spell lends the user has already accepted, so the guard and the spell teach each other.

### Merged with the user's identities (built)

The user, before reading the above: "The stronger elements are life, rock, arcane. For shield+life, the identity is around life and preservation. Probably mixing in elements should mostly be about granting more resistance. Shield Rock is a sturdy barrier, adding elements can add effects like burning attackers, chilling them, etc. Sigil Arcane is the ranged option, so it can just imbue the element in attacks. Haven't thought through the rest yet."

Merged rule, now in the game:
1. **The strongest element leads, as in spells:** Life, Earth, Arcane, then Lightning. Without one, Water, Fire or Cold leads by count. Lightning keeps its place because in spells it's a form element (the arc). The user named only three strong elements, so that's an open point.
2. **Every other element mixes in.** It brings its guard's passive and its resistance row by its rune count: half at 1 rune, all of it at 2. This replaces the "second element only" cut.
3. **What the extras do depends on the lead's identity:**
   - **Leaf (Life, preservation):** the extras grant resistance only. They bring their strengths, never their weaknesses, and they don't bite back. The Life spell lends from the pairing table above are dropped for guards.
   - **Bulwark (Earth, sturdy barrier):** the extras are a **coat that bites back.** Whoever hits the block, or is shoved by the Shove step, takes the coat at half power: Fire burns, Cold chills, Water soaks and pushes.
   - **Prism (Arcane):** a parried beam goes back carrying the coat.
   - **Weak leads and the Spark:** the coat bites on block contact as well.
   - **Arcane wand (Sigil + Arcane):** its bolts already carry every extra rune (imbue), as the user described. Weapons already pick their lead by strength in the rules (`dominant`).
4. **Not built yet:**
   - more of the lead making the shape bigger (HP, Retreat distance, uses);
   - coats on Mend and Siphon;
   - the guard rim drawn in the coat's colours.

   A bite-back flashes in the coat's colour on whoever it bit.

### The user's ratings on the merge (built)

| Item | Answer | Change |
|---|---|---|
| q-mix-lead | strength | Kept: the strongest element leads |
| q-mix-lightning | strong | Kept: Lightning stays a strong element |
| Leaf resistance, Bulwark coat, weak guards, wand | keep | Unchanged |
| q-mix-rest | "Agreed, except I'm not totally sold on prism yet, but it can be what we build for now" | My suggestions for healing hands, the maul and the weak elements stand. The Prism stays as built and is still open |
| Prism mixing | maybe: "What would happen with opposing elements?" | **The returned beam mixes with the coat as in the queue: opposites cancel rune for rune.** A Cold Prism parrying a 1-Fire beam swallows it, and a 2-Fire beam comes back as 1 Fire. Any element left over rides back with the beam. The separate coat bite on a Prism parry is gone |
| q-mix-scale | count: "Not just lead runes, all runes cause some form of scaling, like in spells" | **Every rune in a guard past the first adds 15 % guard HP and 15 % Retreat distance** (`ARMS.runeSize`). The mixed-in elements already scale by count (resistance share, and coat strength through the payload), and so do weapons (each rune adds payload damage). Weapon uses stay fixed at 30, since damage already scales |

Not built yet: coats on Mend and Siphon, and the guard rim drawn in the coat's colours.

### Resistance is hyperbolic (built)

The user: "for resistance we should use the hyperbolic formula so that effective health scales linearly rather than being immortal by hitting 100%".

- A guard's resistance r is now a point value: damage taken is **1 / (1 + r)**, so each point adds the same effective HP (r = 1 doubles it) and no amount of mixing reaches immunity.
- A weakness (negative r) adds damage linearly: taken is 1 − r, so −0.25 takes 125 %.
- The single guards keep their old numbers where possible: 25 % off is r = 1/3, 50 % off is r = 1.
- **What was "immune" is now r = 3: the guard takes 25 %.** This applies to the Ember (fire), the Rime (cold) and the Spark (lightning).
- That own-element level (`ARMS.resStatus`) still wards off the element's status. The Ember can't burn, the Rime can't be chilled, and the Spark can't be stunned by lightning.
- Mixing adds r values before the formula, so the extras now stack without a cap. For example, a Bulwark carrying 2 Fire has r = 3⅓ against fire and takes 23 %.
- Wards (Shield + element cast on yourself) are spells, not guards, and keep their flat resistance.

## The Arcane guard redesigned (built), and the open mixing items

The user: "let's figure out a redesign of the arcane shield". Their notes so far: the block "seems a little meaningless", the card is "maybe too beam specific", "Phasing is cool", and on mixing "not totally sold on prism yet".

**What Arcane is everywhere else.** In spells it's raw, aimed power: the beam. In the hands it's the ranged wand that imbues its extras. So a Shield + Arcane guard should turn defence into reach.

**Options considered:**
- **A. Capacitor and Lance (recommended, built).** Whatever the raised Prism takes is stored as charge: shots, beams, sprays, and melee blows (melee still lands). When you lower the block with enough stored, it fires the **Lance**, an instant arcane line straight ahead.
- **B. Projected pane.** Defend raises the pane at range, on the cursor, to cover an ally. It's very co-op, but it's a second aim gesture on Space, and it overlaps the Shield wall spell.
- **C. Keep the beam mirror and tune it.** This is the smallest change, but it doesn't fix "too beam specific".

**Option A in numbers:**
- Charge holds up to 60, and fades by 6 a second once the block is lowered.
- The Lance needs at least 10 charge to fire. It is 7 u long, stops at rock, and hits everything on it, allies too. It deals 8 + the charge.
- The Prism keeps its parry (a beam goes back, mixed with the coat), Phase, and Clear.
- **Mixing:** the coat rides on the Lance, as on the wand's bolts. A Prism + Fire's Lance burns. The total damage stays 8 + the charge, and the coat only changes its element.
- **In play:** a partner sees a violet glow on the pane that swells as it fills. Then a white-hot line flashes in the coat's colour.
- **Cost:** release-to-fire puts a second meaning on letting go of Space. That only matters for the Prism, and below 10 charge nothing fires.

**The open mixing items, now built:**
- **Siphon:** each rune of an element in the wand refills that element faster again (+100 % per rune).
- **Mend:**
  - Every rune past the first heals 25 % more.
  - Water or Cold in the hands also puts out burning allies.
  - Fire dries, unchills and thaws them.
- **Guard rim:** a dotted ring in the colour of what the guard carries.

Golden hash `e055dcdb` → `7184435b`: the Prism's charge is new state.
