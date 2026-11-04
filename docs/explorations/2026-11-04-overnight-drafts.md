# Overnight drafts: element effects, Shield, Life (2026-11-04)

Three drafts Claude wrote while the user was away, following the open threads in `2026-11-04-sigil-identity-and-buffs.md` and the last entry in `decisions/README.md`. **Nothing here is decided.** Each part ends with a recommendation for the user to react to. They are also on the Spell Atlas page, in the section "Overnight drafts", with questions prefixed `f-`. No rule in `rules-c.js` was changed.

1. What each element adds, in a fixed structure (status, shape change, interactions).
2. Shield in the rune economy.
3. A review of every Life spell.

Facts about Magicka come from memory and are marked *(unverified)*, as in `reference/magicka.md`.

---

## Part 1: What each element adds

### The frame
From the 2026-11-04 doc. Each element owns:
- **(a) one status**: what it leaves on whatever it touches (wet, burning, chilled, …);
- **(b) at most one shape change**: how it bends the spell's geometry (an explosion, a jump, extra weight);
- **(c) interactions**: what happens when its status meets another status.

The point of the frame is that a player can learn seven short lines and predict every spell. It also makes gaps visible: a missing cell is either a deliberate "this element is simple" or a hole.

### Magicka beside the current rules
| Element | Magicka *(unverified)* | Now in `rules-c.js` (trait) |
|---|---|---|
| Water | Wets and pushes. Wet targets take more lightning; a wet caster who casts lightning shocks themselves. Douses burning. With cold, freezes. | **Soak**: wets and shoves. Wet conducts lightning further. With fire, the spell scalds (mix); with cold, it freezes (mix). |
| Life | Heals whatever it touches, friend or foe. Hurts the undead *(unverified)*. Cancels Arcane. | **Mend**: heals whatever it touches, friend or foe. |
| Cold | Slows (chill), stacks to frozen. Frozen targets shatter from a heavy hit. Puts out burning. Cancels Fire. | **Chill**: chills, freezes when it stacks. Frozen targets shatter from a heavy hit. |
| Lightning | Damage that arcs between nearby targets; worse on the wet. The user remembers a stun; not sure it existed *(unverified)*. Cancelled by Water and Earth. | **Chain**: shocks and jumps to a neighbour; more lightning, more jumps; wet targets carry it further. |
| Arcane | Raw damage and the beam form. On rocks and ice it makes them explode on impact. The user remembers that in a beam it extended the duration *(unverified)*. Cancels Life. | **Burst**: a small explosion on hit; raw damage that ignores most wards. |
| Earth | The rock missile; knockdown; rock walls with Shield; earthquake as Area. Grounds lightning (cancels it). | **Weight**: hits harder, knocks down, makes the spell slower and sturdier. |
| Fire | Burning (damage over time). Dries the wet. Spreads to grass and oil. Cancels Cold. | **Burn**: sets alight; spreads to grass and oil; dries wet targets. |

### The current rules in the frame
| Element | (a) Status | (b) Shape change | (c) Interactions |
|---|---|---|---|
| Water | Wet | Push (shove) | wet + lightning: jumps further. wet + cold: frozen (mix). fire dries wet. Water puts out burning *(self-cast only)*. |
| Life | none (an instant heal) | none | none, other than cancelling Arcane in the queue |
| Cold | Chilled → Frozen | none | frozen + heavy hit: shatters. Cold puts out burning *(self-cast only)*. |
| Lightning | Shocked (damage only) | **Chain** | wet carries it further |
| Arcane | none | **Burst** | ignores wards (one-sided) |
| Earth | Knocked down | **Weight**, and in practice it is the **material** (see below) | the heavy hit that shatters the frozen |
| Fire | Burning | none | dries wet |

### What the table shows
**Shape changes.** Four elements bend the spell (water pushes, lightning chains, arcane bursts, earth adds weight). Three don't: **fire, cold and life**. Arcane's burst is the most visible, and the user is right that it is unusual: it is the only shape change that creates a *new* area of effect where the spell lands.

**Statuses.**
- **Arcane and Life have no status.** Arcane is pure damage plus a shape; Life is pure healing.
- **Three statuses all mean "this target is out of action":** frozen (cold), knocked down (earth) and the stun the user remembers for lightning. If lightning gets a stun, they need to feel different (see the draft below).
- **Two displacements:** water pushes and earth knocks down. They are distinct enough (one moves you, one drops you where you stand), but they should stay that way.

**Interactions.**
- **Arcane and Life interact with nothing.** Everything else has at least one partner.
- **Some are one-sided.** Cold puts out burning, but fire doesn't thaw the frozen. Water and cold putting out burning only exists in the self-cast text, not in the payload rules.
- **Earth grounds lightning only in the queue** (they cancel). In the world, a rock wall doesn't stop a chain.

**Earth is never really a payload.** Counting with the Atlas resolver: Earth outranks every form except Shield and Sigil, so whenever Earth is in a spell it either *is* the form (a rock), or it is the *material* of a Shield or Sigil thing (a rock wall, a stone orbital, stone armour). Earth's "Weight" trait is never applied as a payload anywhere. This is good news for the rule from 2026-11-04 ("Earth is the material, the others coat it"): the payload table and the material rule are already the same thing. Earth's shape change *is* "it becomes the body." The table should say so instead of "Weight".

Similarly, Arcane and Life only ever ride as payloads on Earth, Shield and Sigil spells, because they outrank Lightning and the sprays. So "a fire spray with arcane" never happens: it is an arcane beam with fire.

### Three fixes for the shape-change gaps
**E1. Keep it: fire, cold and life are "status elements."**
- Nothing changes. Four elements bend the spell, three only leave a status.
- *In the hands:* fire and cold are the reliable, readable ones; arcane and lightning are the showy ones. It fits the earlier observation that the spray rows are the simple, fast tools.
- *Cost:* stacking fire is just bigger numbers. Cold has nothing visible when it's a payload until the target freezes.

**E2. One shape change each.**
- **Cold: Shatter.** On impact (or when the structure breaks) the spell splits into ice shards that fly on. A rock with cold bursts into shards; a cold curtain shatters outward when it falls; a turret's shots splinter.
  - This brings back two liked spells that were lost when Ice stopped being an element: **Ricochet Bolt ★** and **Ice Shrapnel ★**.
  - It fits cold's existing interaction (frozen things shatter).
- **Fire: Trail.** The spell leaves burning ground along its path or where it lands. A thrown rock with fire leaves a burning streak; a wave with fire leaves a burning track.
  - *Cost:* it overlaps with the Fire patch (Place) and with burning grass in the world. It also covers the floor in fire, which is hard to read in co-op.
- **Life: Linger.** The heal doesn't land all at once; whoever it touches regenerates for a while. (This is also Part 3's question.)
- *In the hands:* every element now visibly does something to the spell's shape, and the language gets richer.
- *Cost:* a rock with arcane, cold and fire would burst, shatter *and* leave a trail. That's three shape changes at once, which is the readability problem flagged in `2026-11-03-full-tree.md` (is two payloads the practical ceiling?). E2 needs a stacking rule (S2 below).

**E3. Payloads are only statuses; shape belongs to the form.**
- Arcane's burst becomes a status, **Unstable**: the target bursts the next time it's hit hard, or when it dies. Lightning's chain becomes **Charged**: the shock arcs on to a neighbour a moment later.
- *In the hands:* the cleanest rule to learn ("payload = what it leaves on them"), and it adds combos (mark with arcane, set off with a rock).
- *Cost:* it loses the immediate, satisfying explosion the user called out as unique. It makes arcane a set-up element instead of a payoff.

**Claude's recommendation: E2 for Cold only, and leave Fire and Life as status elements for now.**
- Cold's shatter is cheap, already implied by its interaction, and brings back two ★ spells.
- Fire's trail overlaps too much with existing spells and makes the floor hard to read.
- Life is the special case in Part 3.
- That gives five shape-changers (water push, cold shatter, lightning chain, arcane burst, earth as the body) and two status elements (fire, life).

### Filling the status and interaction gaps (draft)
| Element | (a) Status (draft) | (b) Shape (draft) | (c) Interactions (draft; **new** in bold) |
|---|---|---|---|
| Water | Wet | Push | wet + lightning: more damage, jumps further. wet + cold: frozen. **A wet caster who casts lightning shocks themselves** (the user's note; Magicka *(unverified)*). **Water puts out burning, in every spell, not just self.** |
| Life | none (heal); open: **Regenerating** | none | **On a structure, Life mends the structure** (Part 3). Cancels Arcane. |
| Cold | Chilled → Frozen | **Shatter** (E2) | frozen + heavy hit: shatters. **Cold puts out burning, in every spell.** |
| Lightning | Shocked → **Stunned**: a short interrupt that breaks a cast or a wind-up. You can still walk. | Chain | wet: more. **Earth grounds it: chains don't jump through or over rock walls** (the world version of the queue cancel). |
| Arcane | **Exposed**: for a moment the target's wards and resistances don't count, and structures take extra damage. | Burst | **Arcane breaks barriers and wards** (it already "ignores most wards"; this names it as a status that others can use). |
| Earth | Knocked down | **It becomes the body** (material) | heavy hit shatters the frozen. Grounds lightning. |
| Fire | Burning | none | dries wet. **Fire thaws the chilled and frozen** (the missing half of cold putting out fire). |

**How the three "out of action" statuses differ (draft):**
- Frozen: can't move, brittle.
- Knocked down: on the ground for a moment and drops whatever it was casting.
- Stunned: interrupted, but can still walk.

So a stun is the anti-caster status, a knockdown is the anti-melee one, and a freeze is the set-up for a big hit.

**Interaction matrix (draft).** Rows are a status already on the target; columns are what hits it next.

| On the target ↓ / hits it → | Water | Cold | Lightning | Arcane | Earth | Fire | Life |
|---|---|---|---|---|---|---|---|
| **Wet** | wetter | **frozen** | more damage, jumps further | — | — | dried (wet removed) | — |
| **Burning** | put out | put out | — | — | — | hotter | healed, still burning |
| **Chilled / Frozen** | frozen (if chilled) | more | — | — | **shatters** | thawed | healed, still frozen |
| **Stunned** | — | — | longer | — | — | — | — |
| **Knocked down** | shoved along the ground | — | — | — | — | — | — |
| **Exposed** | — | — | — | — | — | — | — (wards don't count, so everything lands) |

Arcane and Life still mostly sit out. That may be right: arcane is "raw damage" and life is "the heal". If that's the intent, the doc and the Atlas should say so plainly instead of leaving it as a gap.

### Stacking: 2× Fire versus Fire + Lightning
With runes, both cost two runes. So the question is what each buys.
- **2× Fire** is *depth*: a hotter, longer burn on one target.
- **Fire + Lightning** is *breadth*: a burn plus a chain that reaches a second target.

That's a real choice, and runes make it fair, because neither is cheaper. Three ways to treat stacking:

**S1. Additive (now).** Every rune adds its own trait at full strength. A repeat makes the trait stronger, and a new element adds a new trait.
- Simple, and it is what the Atlas does today.
- *Cost:* with E2, a 4-payload spell has four statuses and up to three shape changes.

**S2. Many statuses, one shape.** Every payload adds its status, but only the **leading payload** (most runes; ties by the form priority) changes the shape.
- A rock with arcane and cold either bursts or shatters, depending on which you put in more of.
- *In the hands:* "what I put most of decides how it lands." That's another lever the player controls by counting runes.
- *Cost:* a second element with a shape change only adds its status, which is a little less than it adds alone. It still changes the spell, so the inert-additions audit stays at 0.

**S3. Split like auras.** Several payload kinds share the power, each weaker, as Sigil auras do.
- *Cost:* it punishes mixing twice, because runes already make mixing cost different pools. Not recommended.

**A mix is just an interaction inside one spell.** Water + cold freezes because the spell wets and then chills in the same instant; water + fire scalds because fire dries the wet into steam. Seen this way, the two `MIX` rules aren't special cases. They are the interaction matrix firing inside one cast. Fire + cold and water + lightning cancel in the queue because their interaction destroys one of them. The Atlas text could say this, and nothing in the rules needs to change.

**Consistency with "Earth is the material, the others coat it":** it holds everywhere the resolver lets Earth appear (a rock wall coated in fire, a burning rock, a stone turret, stone armour, a bulldoze). The one place it breaks is Life: a coating *delivers* its status to whoever touches it, so stone armour coated in Life heals the enemy hitting you, and a Mending bulldoze heals the enemies you shove. Part 3 covers this.

**Claude's recommendation: S2.** It caps each spell at one shape change on top of its form. That matters more if E2 is adopted, but it reads better even without it.

---

## Part 2: Shield in the rune economy

### Where Shield stands
- Shield is the barrier form. It never stacks (Shield + Shield cancel), and Shield + Sigil cancel.
- **Energy** structures (pure Shield and elemental curtains: arcs, drawn walls, rings) cost upkeep as regen debt: "a trickle when idle, more while it absorbs hits", never below a reserve. **Which pool pays is not written down**: Shield, or the coating elements.
- **Stuff** (Earth walls, the conjured Bulwark and Buckler) is paid once and lasts until it breaks. The cap on stuff is still open for walls; Bind answered it only for Sigil devices.
- **Sigil binds** one Sigil rune per device (count).
- **The Shield + Force wave** is a one-off.
- **The ward (Shield + Self) is a one-off** that lasts its natural duration. It's the most powerful Shield spell (reflect, or elemental resistance), and it currently costs one Shield rune plus the elements. **That's the main hole.**
- The user asked for an energy shield that **fades as its caster runs low**, so allies can see the upkeep.
- The decision log says: "Shield keeps its upkeep over time (endurance). Sigil binds (count)."

### Three models
**Model A: Endurance. Every energy barrier drinks from your Shield pool.**
- Every energy barrier and every ward is paid by the **Shield pool only**. The elements in it (a fire curtain's fire) are paid once at cast, like a Sigil device's ammo.
- Upkeep is regen debt with two parts: a small **idle drain per standing barrier**, and a **drain per hit absorbed**, scaled by the damage.
  - *Illustrative numbers:* Shield regen 0.3/s, each idle barrier 0.1/s, a ward 0.2/s idle, and each hit 0.1–0.5 of a rune.
  - Three idle walls break even. Under archer fire the pool runs down.
- **Earth walls stay stuff:** paid once, no drain. They are the tool for preparing in a lull; energy walls are the tool for reacting.
- **The ward costs for real.** It is a barrier on your body, so it takes the focused fire that a wall would spread out. It drains at twice a wall's idle rate, and every reflected shot or resisted hit costs Shield. A ward under heavy fire lasts seconds, not its "natural duration."
  - One ward per caster: tossing it onto an ally (Ward toss) means you don't have one.
- **Fading:** every barrier you own is drawn at the opacity of your Shield pool *above the reserve floor*. All your shields fade together, so an ally reads "her shields are thin" as "she's running low" at a glance. Hits add cracks; the fade is the pool.
- **The reserve floor:** drain stops at the floor (say 1 Shield rune). When the pool reaches it, your **oldest** barrier breaks first, then the next. The floor rune is always there for one emergency quick wall or ward.
- **The Shield specialist** (deeper Shield pool, faster regen) holds more walls for longer, and soaks a whole wave. They play like an anchor:
  - drop the idle walls when a wave ends, to stop the drain;
  - raise a ward exactly when a volley lands, and not before;
  - toss the ward onto the ally who is being focused.
- *Pillars:* 1 (timing and reading the fight are skill; depth is accepted progression), 3 (Ward toss is a real gift because it costs you), 4 (an honest, visible limit), 7 (earth walls reward preparing; energy walls can't be stockpiled for free).
- *Cost:* the Shield pool becomes a second health bar. Drain that spikes with hits can empty you at the worst moment; the floor softens it, but some of that tension is the point. "How many walls can I hold?" has no fixed answer, because it depends on how hard they're hit.

**Model B: Shield binds like Sigil, and hits crack the bound rune.**
- Every barrier or ward binds one Shield rune while it stands, and there is no idle drain. The bound rune is the barrier's health: hits crack it, and when it cracks through, the barrier breaks and the rune starts regenerating from empty.
- **This reverses the decided asymmetry** ("Shield keeps upkeep over time, Sigil binds"). It's listed because the symmetry is tempting, not because Claude recommends it.
- **Fading** is per barrier (its own cracks), not per caster. That is only half of what the user asked for: an ally sees which wall is about to go, but not that the caster is running low.
- **Ward:** binds a rune like a wall; to make it costly it would have to bind two, which breaks the one-rune rule.
- **The specialist** keeps more barriers at once, which is exactly what a Sigil specialist does with devices. The two roles blur.
- *Cost:* barriers built in a lull cost nothing to keep, which favours turtling. The reserve floor plays no part. *Gain:* the simplest HUD (bound runes are shown hollow), and no drain at peak moments.

**Model C: Pay for the work done, by material.**
- **Energy barriers cost nothing while idle.** Every hit absorbed costs Shield. A ward pays twice per hit.
- **Earth walls reserve their Earth runes** while they stand, and give them back as they crumble or when you let them go (the user's own earlier idea, from `battlefield-building.md`). That answers the open cap on stuff: your Earth pool is how much wall you can keep up.
- **Fading** is the Shield pool, as in A. Earth walls don't fade; they crack.
- **The specialist** is an efficient absorber.
- *Cost:* three cost modalities to learn (consume, reserve, bind). Reserving Earth means a builder can't throw rocks, which is a sharp trade (good or bad). Idle energy walls are free, which favours turtling as in B.

### Recommendation: Model A
- It keeps the decided split: Shield is endurance, Sigil is count.
- It answers the user's fading request exactly: one pool, all your shields fade with it.
- It gives the ward a real cost without a new rule: a ward is just a barrier on your body that takes all the hits.
- It keeps preparation (earth walls) and reaction (energy walls) apart, which fits pillar 7 and limits turtling.

**Optional, from C:** Earth walls reserve their Earth runes. This would close the open cap on stuff, but it changes how earth walls feel to build, so it's a separate question (`f-shield-earth`).

**Smaller calls inside A:**
- The coating elements are paid once; only Shield pays upkeep. One pool per structure keeps the fade readable.
- The Shield + Force wave stays a one-off.
- The conjured Bulwark and Buckler stay stuff (durability).

**Smallest test:** one choke, waves of archers, a 3-rune Shield pool with visible fade, drawn walls and the ward. Do players drop idle walls between waves, and time the ward to the volley, without being told?

---

## Part 3: Life spells

### Every Life spell in the current grid
| Spell | Recipe | What it does now | Problem |
|---|---|---|---|
| Life beam | Life, Force | Sustained beam; heals whatever it touches. Sustain cost. | Fine. The most skilled heal: aim, angle, upkeep. An enemy in the way gets healed, which is an aiming mistake. |
| Healing ring | Life, Area | Heals everyone around you, **enemies included**. | In a melee scrum, the heal reaches the enemy next to your ally. Magicka's oldest complaint *(unverified)*. |
| Healing spring | Life, Place | A lingering patch that heals whoever stands in it. | Enemies standing in it heal too. Otherwise a good support tool (place it behind the line). |
| Healing swing | Life, Weapon | One imbued swing that heals. | Odd but harmless: you bonk an ally once. Overlaps the Mending rod. |
| Mend (payload) | Life + anything it doesn't lead | The spell heals what it hits, along with its other effects. | **Self-defeating.** A rock that heals the enemy it hits; an earthquake that heals; a life beam that also burns. |
| Healing orbitals ★ | Sigil + Life, Area | Orbs heal the first hurt ally that comes close. | Fine alone. **With fire, each orb heals your ally and sets them on fire.** |
| Life beam turret | Sigil + Life, Force | Auto-beams the nearest hurt ally. | **With fire, it burns the ally it's healing.** |
| Life glyph | Sigil + Life, Place | Goes off when *someone* steps on it, healing them. | An enemy can step on it. A heal trap that anyone can trigger is mostly a gift to the enemy. |
| Mending rod | Sigil + Life, Weapon | A conjured rod whose hits heal. | Fine, and funny. |
| Regeneration | Sigil + Life, Self | Health comes back to *you* over time. | Called an aura, but it affects only you, while every other aura affects those around you. |
| Heal | Life, Self (or on an ally) | Heals you; hold to heal over time. | Magicka's self-heal spam *(unverified)*. With runes it is capped by the Life pool, which mostly solves it. |
| Elemental wave (with Life) | Shield + Life, Force | Everyone the wave passes is healed, enemies too. | It heals the enemy line it sweeps through. |
| Curtain arc, Ring of curtains (with Life) | Shield + Life, Place / Area | Crossing it heals. | Enemies walk through your healing wall and get healed. |
| Ward (with Life) | Shield + Life, Self | "A bubble that resists life." | **Nonsense:** nobody attacks with life. |
| Stone armour coated in life | Shield + Earth + Life, Self | Melee attackers are healed. | Self-defeating. |
| Mending bulldoze | Sigil + Earth + Life, Self | Whoever you shove is healed. | Self-defeating: you mostly shove enemies. |
| Life cancels Arcane | queue | Opposites, as in Magicka. | Fine. It keeps "Arcane harms, Life mends" as a clean pair. |

**Counted with the resolver:** 225 of the 678 distinct spells contain Life, and **195 of them (29% of all spells) mix Life with Fire, Cold, Lightning or Earth.** So nearly a third of the grid is a spell that heals and harms at once. The zero-inert-additions rule forced Life to do something everywhere, and "heal what it touches" makes it an anti-damage additive in most of those places.

### What was weird in Magicka *(unverified)*
- Life Area healed every enemy around you; healing one ally meant healing everyone near them (the user's note from round 1).
- Self-heal was quick to type and spammable, so it was strong because it was easy to type (the thing pillar 4 rules out).
- Life in projectiles (healing rocks) existed, and was mostly a joke.
- Revive was a Magick, not a Life spell.

### The problems
1. **Healing the enemy by accident** (ring, spring, wave, curtain, glyph, aura). It's friendly-fire comedy, but for support it's frustrating more than funny. The user wasn't sure about it in round 3.
2. **Heal spam versus runes.** Runes mostly solve this: healing throughput becomes Life regen, and a Life specialist becomes the healer. What's left is that **four spells heal on their own** (turret, orbitals, spring, glyph). That's a risk of the "passive heal-bot" that `support-verbs.md` warns about.
3. **Life as a payload in a damage spell defeats itself** (195 spells).
4. **Co-op readability.** A green spell should mean help. A green-and-orange spell coming at you might be either.
5. **Coatings deliver Life to the wrong side** (stone armour, bulldoze, curtain).
6. **The Life row has no geometry of its own.** It is Arcane's row with the sign flipped (beam, ring, spring, swing).

### Three directions
**L1. Magicka's rule, tidied.**
- Life heals whatever it touches, friend or foe (the decided rule stays). Life in a damage spell still heals what it hits; those spells are accepted as mistakes, like Hurt and Bruise on yourself.
- Fix only the nonsense:
  - **On a structure, Life mends the structure.** A Life curtain or wall regenerates, so it costs less upkeep. Stone armour coated in life mends itself, so the ward lasts longer. Shield + Life on yourself becomes a **Mending ward** (it heals you slowly while it holds), instead of resisting life.
  - The Mending bulldoze heals *you* a little per shove, not the enemy.
  - Devices with Life aim at hurt allies (as now), and the Life glyph goes off only for allies.
- *In the hands:* the same as Magicka. Healing well is about aim: keep the ring away from the scrum.
- *Cost:* about 190 spells that are mistakes stay in the language. Pillar 2 says spells are words; these are words that mean "oops".

**L2. Life knows friends.** *This changes the decided rule* "Life just heals what it touches".
- Life heals allies and passes through enemies. The ring, spring, wave and curtain heal only your side.
- In a damage spell, Life heals the allies it touches, and they still take the rest.
- *In the hands:* healing gets easy and safe. A support player can throw heals into a scrum without thinking.
- *Cost:*
  - The comedy is gone, and so is the skill of aiming a heal.
  - It edges back towards the retired "Life makes a spell ally-safe": in co-op, one Life rune softens friendly fire from any spell. That undermines pillar 3.
  - It is still muddled in damage spells (heal and burn the ally).

**L3. Life leads: a spell with Life in it is a support spell.**
- **Life outranks Earth in the form priority** (just below Shield and Sigil). So there is no Life rock, no Life earthquake, and no Life payload in any damage spell; inside a Sigil device, Life leads too.
- **The other elements in a Life spell lend their shape, never their harm:**
  - Lightning: the heal jumps from ally to ally (chain heal).
  - Cold: the heal splits into shards that each find an ally (needs E2's Shatter).
  - Water: the heal shoves the ally a little, a rescue nudge, and puts out burning.
  - Earth: a lobbed heal-stone that lands and bursts. Earth is the material, life the coating.
  - Fire: no shape, so it lends its helpful interaction: thaws and dries the ally.
  - Arcane: cancels.
- **Inside Shield**, which still outranks Life, Life mends the structure (as in L1).
- **Who gets healed is unchanged:** whoever the heal touches, friend or foe. But the heal is now aimed through support shapes, and see the wand below.
- *In the hands:* green always helps. A chain heal through the backline, a heal-stone lobbed over a wall, a healing turret that jumps between allies. Support gets its own vocabulary inside the same grammar.
- *Cost:*
  - **It is an exception to proposal C's core rule** ("one trait per element, the same in every form"). Inside a Life spell, elements mean "shape" and "helpful interaction", not "harm". That's a second reading to learn.
  - It changes the form priority.
  - The healing rock is gone (nobody will miss it).
  - It leans on E2 for Cold. Without Shatter, cold in a heal would need a helpful interaction instead (put out burning), which overlaps water.

**A cross-cutting knob: who does Life heal?**
- **(a) Everyone it touches.** As decided, and as in Magicka.
- **(b) Allies only.** L2.
- **(c) Everyone, but the sculpting wand spares enemies.** While you hold the Sigil wand, your spells "only do what you mean": your harm spares allies, and your heals spare enemies. This uses a tool that already exists, keeps the decided rule and the comedy, and gives pillar 3's "deliberate way to avoid" a matching half for heals.

**Smaller calls in every direction:**
- **Regeneration aura** becomes a true aura: you *and those around you* regenerate slowly. Under (a) enemies next to you do too, which is a reason to hold the wand or keep your distance.
- **Self-heal:** tap Life on yourself spends a rune for a burst; hold it to channel as sustain (regen debt on Life), and you move slowly while channelling. Healing throughput is your Life regen. A Life specialist is the healer, and that's the progression pillar 1 already accepts.
- **The four heals that run on their own** each get a clear job:
  - Spring: a zone for the group, placed ahead of time (pillar 7).
  - Orbitals: reactive, for the first ally who comes to you.
  - Turret: ranged and automatic, but its ammo is the Life runes you paid (finite).
  - Glyph: allies only, a prepared heal on a fallback line.

  All of them are prepaid, finite healing (their ammo rule), so none is a free heal-bot.

### Recommendation: L3, with (c) for who gets healed
- It removes the 195 self-defeating spells instead of explaining them.
- It makes green readable in co-op.
- It gives support players new verbs (chain heal, heal-stone, rescue nudge) without new keys.
- It keeps the decided "Life heals what it touches."

The price is one named exception to the payload rule. **If that exception feels wrong, L1 is the fallback**: it changes the least and fixes the nonsense cells.

---

## Questions on the Atlas (section "Overnight drafts")
| id | Question |
|---|---|
| `f-effects-table` | Is status / shape / interactions the right structure for "what each element adds"? |
| `f-shape-gaps` | E1, E2 or E3, or Claude's mix (Cold shatter only)? |
| `f-statuses` | The draft statuses: Lightning stuns (interrupt), Arcane exposes, fire thaws, water and cold put out burning everywhere, earth grounds chains. |
| `f-stacking` | S1, S2 or S3 (recommended S2: one shape per spell), and "a mix is just an interaction inside one spell". |
| `f-shield-model` | Model A, B or C (recommended A: endurance). |
| `f-shield-self-cost` | The ward as a barrier on your body: double idle drain, every hit costs, one ward per caster. |
| `f-shield-fade` | All your shields fade with your Shield pool above the floor; at the floor the oldest breaks first. |
| `f-shield-earth` | Should earth walls reserve their Earth runes (the cap on stuff)? |
| `f-life-direction` | L1, L2 or L3 (recommended L3: Life leads). |
| `f-life-payload` | Life never rides in a damage spell; on a structure it mends the structure. |
| `f-life-enemies` | Who does Life heal: (a) everyone, (b) allies only, (c) everyone, but the wand spares enemies. |
| `f-other` | Anything else on these drafts. |

## Next step
The user answers the `f-` questions. Whatever is kept goes into `rules-c.js` in one pass, then `audit-c.js` and `depth-c.js` are rerun, and decisions are logged. Life under L3 changes the form priority, so the cell counts will move.
