# What the element identities change in the spells (2026-11-28)

Every cell of the Spell Atlas (`tools/spell-atlas/rules-c.js`), checked against the [element identities](2026-11-28-element-identities.md), the [casting styles](../ideas/casting-styles.md) and the [spell pass](2026-11-27-spell-pass.md) (Shift casts swapped, Haste, the Lens on Force, glyph charges, world spells). The user rates each change on the [Spell Ramifications page](../../tools/spell-ramifications/index.html) (db collection `answers`, one doc per item id below, `{choice: yes/tweak/no, note}`). Nothing is built. Thread: [element-identity](../threads/element-identity.md).

## The rules applied
1. **Who is still paying:** released (runes once), Concentration (held against pressure), a Binding (a made thing).
2. **Arcane** concentrates (beam, charge and release, delayed blast) and disrupts what's paid for, by amounts, power against power. Matter is out of its reach.
3. **Walls stop everything;** coats decide what each hit costs; wards resist magic only.
4. **No switches:** no absolute reflection, immunity or dispel.
5. **Lightning** follows rules you can learn and disrupts actions; **Fire** consumes; **Water** is the medium; **Cold** controls.

## Only the cost changes
| Spell | Today | New |
|---|---|---|
| Blink (Shield, Force) | a Shield rune | a lump of Concentration |
| Elemental blink | a Shield rune + elements | a lump of Concentration + elements (released) |
| Barrier, ring of barriers, coated field and ring | drain the Shield pool (+ elements once) | drain Concentration (+ elements once) |
| Wards, on you or an ally | the Shield pool as a battery | Concentration |
| Rock wall, arc, ring of stone; ice wall, ring of ice | a Shield rune + Earth or Ice, paid once | Earth or Ice + a Binding |
| Stone armour (Shield + Earth on yourself) | paid once | Earth + a Binding |
| The nine guards | paid once | a Binding |
| Weapons, the sculpting wand | bind a Sigil rune | a Binding |
| Turrets, the Lens | bind a Sigil rune | a Binding (turret shots still draw from pools) |
| Glyphs, line glyphs, the snare glyph | bind a Sigil rune | a Binding (with charges, per the spell pass) |
| Orbitals, rune motes | bind a Sigil rune | a Binding |
| Auras, Haste | bind a Sigil rune | a Binding |

Everything else keeps its cost: sprays, rings, missiles, beams (upkeep as now), patches, rain, fog, heals, every Earth, Lightning and Ice spell.

## Changes to judge
Claude's recommendation is given with each; ids are the page's.

**Arcane**
- `c-expose` **Expose becomes disruption.** Today: "for a moment its wards and resistances don't count, and structures take extra damage", a switch that also hits rock. New: each Arcane rune in a spell disrupts by an amount: it drains the Concentration of the fields and wards it hits, strips HP or charges from Bindings, shortens timed magic and lowers magical resistance. No bonus against flesh or stone. Recommended: it's the core of Arcane's new identity.
- `c-arcane-shield` **Shields are weak against Arcane.** Today a barrier stops enemy beams outright. New: Arcane hits on a field or ward cost extra Concentration; an Arcane coat (Shield + Arcane) resists that; a spell disrupts by its Arcane runes only, so a fire beam (Arcane + Fire) disrupts less than a pure Arcane beam. Recommended.
- `c-nova` **The Arcane ring charges and releases.** Today an instant blast ring. New: how long you hold before releasing charges it (bigger, stronger, capped near 1.5 s); a tap still gives a small quick ring, so it stays a panic button. The Arcane imbued burst charges the same way, since the ring and the burst are one cast. Recommended; it costs a slower emergency ring.
- `c-attune` **Attune becomes opening yourself.** Today: twice the regen for 3 s an Arcane rune, a 16 HP sting a rune, 25 % more damage taken. New: it strips the magic held on you (buffs and hostile effects, by amount); field regen doubles (not Concentration); while it lasts, magic acts 25 % more on you both ways (spells and heals), blows unchanged; the sting stays. Recommended. Question: may you open the ally under the cursor (a support verb: free them of a hostile effect at the price of their buffs)? Claude: yes.
- `c-arcane-aura` **The Arcane aura becomes a disrupting field.** Today (Sigil + Arcane on yourself) a glass cannon: more damage, easily knocked down; it overlaps opening yourself and isn't something that "affects those around you". New: magic near the wearer is disrupted a little every half second (enemy wards and fields drain, glyphs and turrets lose HP), your partners' included. Recommended: walk it into an enemy shield wall, keep it away from your healer's wards.

**Shield**
- `c-mirror` **The mirror ward stops being absolute.** Today Shield alone on yourself turns back the next few shots. New: it turns shots back while it holds, each one draining Concentration by its damage, so a big hit gets partly through; Arcane shots aren't returned, they pour in. Recommended (no absolute reflection).
- `c-turnback` **Barriers turning shots back** follow the same rule. Recommended.
- `c-prism` **The Prism becomes the anti-magic guard** (the user's idea). Today: Arcane +1 resistance, Physical −0.25; it stores what it blocks and Lances it; the only block that stops beams and sprays; Phase and Clear. New: some resistance to every element, weaker against blows (about −0.5); Capacitor, Lance, Phase and Clear kept. Optional: its block disrupts the ward or field behind what it stops. Lean yes; it overlaps wards a little.

**Life and Earth**
- `c-hedge` **Shield + Earth + Life is a living hedge.** Today a rock wall that heals those sheltering against it. New: it also regrows its own HP slowly, and Fire burns it fast (Fire consumes growth). Small, optional; a first pull on the Life thread.
- `c-imbue` **Imbued resistances count as magic.** The line made exact: physical states (wet, burning, chill, frozen, knocked down) are the world's; magic is anything held, bound or lent (wards, auras, Haste, imbues). Arcane cuts imbues by amount. Recommended: opening yourself needs it.

**Lightning**
- `c-arc` **Lightning's path follows stated rules.** Its jumps prefer the wettest body in reach, then the nearest (tall and metal later), and the help panel says so; its stun interrupts channels as well as wind-ups (to check in the sim). Recommended: small, and it makes "unpredictable" learnable.

**Across the game**
- `s-economy` **The rune budget without Shield and Sigil.** Claude: scale the shared regen R by 7/9 at first, so the field elements regen as now; Concentration refills on its own while nothing's held; start with 3 Bindings (Sigil had 3 runes) and a 3 s cooldown; Survive starts with 1 Binding as it starts with Sigil 1.
- `s-boosts` **Attune, Siphon and zones touch only field pools,** never Concentration or Bindings, which grow through training. Recommended.
- `s-power` **A caster power stat** on every caster (the wizard's grows with the campaign, enemy casters by type), used by disruption first: disruption = Arcane amount × attacker power / holder power. Recommended.
- `s-world` **World spells:** their element runes stay bound (as decided); pure Sigil time warp holds a Binding; pure Shield Nullify holds Concentration. Recommended.
- `s-kit` **A weapon and a guard are two Bindings.** With 3, a sword and a guard leave one for a turret or a glyph: a real limit on melee builds. Claude: accept it and tune the count; the alternative is a free slot for one carried weapon.

## Already agreed
- An Arcane rune in a rock wall makes a **charged wall** (stores the magic that hits it, glows, bursts when it breaks or is dismissed); numbers open.
- **Arcane gets no bonus against stone:** rock walls, stone armour and boulders take its plain damage.
- A shield takes an Earth-carried spell's impact in full, its coat resists only its elements (already the rule).

## What else moves with it
The HUD (a Concentration bar and Bindings in place of two rune pools), the tutorial's Shield and Sigil beats, the help panel and the Atlas's rules text (`rules-c.js`, then `npm run sync-rules`), Survive's starting pools, the balance reports.
