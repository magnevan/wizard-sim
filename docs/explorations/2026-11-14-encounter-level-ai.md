# 2026-11-14: Encounters, not enemies: pacing, synergy, defence and the Sigil economy

The user's first notes on the [Enemy Roster](https://claude.ai/artifact/QSBW1MzxrF7P1cktdfnXtP), before rating it in detail, with Claude's development of each point. Follows `2026-11-14-enemies-and-ai.md` and `2026-11-14-enemy-wizards.md`. Nothing here is decided yet.

## What the user said

1. **The AI that matters works at the level of the encounter.** One enemy's telegraph is only half the story: one charger at a time is a different fight from three charging together at random, and more so because rune regen paces how fast you can answer.
2. **Enemies that work together:** shieldbearers in front of archers, healers behind fighters, summoners whose summons you have to fight, which forces you to advance. The campaign has to layer these in gradually.
3. **Encounters that reward defence:** chokepoints for area spells, turrets holding a flank, glyphs and traps for bursts (and flanks a little, though they're one shot), shields in general.
4. **The Sigil economy will need a rethink** as this goes deeper. The user's read today:
   - **Orbitals and the stored spell** are good baseline preparations that trade Sigil for banked power. Orbitals act on their own, lowering your mental load, but may fire when you don't need them. The stored spell is more flexible.
   - **Turrets** don't bank power. They stretch your presence and raise how many runes a second you can spend, so they buy burst.
   - **Glyphs** are like orbitals placed away from you: they don't travel with you, which helps and hurts.
   - **In Survive turrets feel very strong,** because they cast without risk and use regen you'd otherwise waste. They'd be weaker where you're short on runes, and they could be made destructible.

## 1. The demand budget: pacing in runes

Every telegraphed threat asks a question, and every answer costs something: runes (a wall, a Blink, a ring) or position (a step aside). So an encounter can be measured by the **demand** it puts on the party: the runes a second it takes to answer what's coming. The party's supply is its regen (R = 1 rune a second each) plus what it has banked: full pools, a stored spell, orbitals, glyphs already down.

- **Steady pressure stays under the supply.** If demand outruns regen for long, the party runs dry and the fight becomes attrition: the "everything at once" feeling Magicka 2 was criticised for.
- **Peaks spend the bank.** A short spike above regen is fine, and it's exactly what preparation (pillar 7) is for. A party that banked a stored spell or laid a glyph meets the spike; one that didn't takes it.

**Stagger by default, synchronise on purpose.** The encounter keeps a heavy-attack queue: charges, slams, signature spells and bomb volleys take a slot from it, spaced so the cheapest answer has time to regenerate (one rune at R = 1: about 1.2 s between them). That's the per-wizard attack token from the roster, lifted to the whole encounter and to the moves that cost an answer. When the encounter does want a spike, it's a **volley**: the attackers hold, show one shared tell (a horn, a rallying cry, three chargers pawing in a line) for about 2 s, then go together. A volley is a test of what you prepared, and it's announced like one.

| Three chargers | What it feels like | What answers it |
|---|---|---|
| At random | Sometimes two overlap, unreadably; luck decides | Nothing reliably |
| Staggered (the default) | One question at a time, each answerable | A step, or one wall each as runes allow |
| A volley | A held breath, then all three | A wall laid in the 2 s, a glyph line, a stored spell |

The director that already holds spawns while the party is under stress (`ai-pacing` on the roster) works in the same units: it can estimate demand from the enemies alive and their attacks, and supply from the party's pools.

## 2. Compositions, and the order they're taught in

A composition is two roles that cover each other's weakness, so the answer to one enemy is blocked by the other:

| Composition | Built from | What it asks |
|---|---|---|
| **Screen and shooter** | Shieldbearer or brute in front, archers behind (archers already hide behind them) | Go round, or reach over: Point, Yank, lobbed casts |
| **Front and sustain** | Fighters with a warding shaman or healer behind | Who first: break through to the support, or out-damage it |
| **The clock** | A summoner (gravecaller) or open burrow holes that keep spawning | Advance: it gets worse the longer you hold back |
| **Set-up and payoff** | A hedge wizard that soaks, a storm wisp that shocks | Break the chain: dry off, ward, kill the set-up first |
| **Bait** | A slow tank in the open, sappers lobbing from behind | Don't tunnel on the big one |
| **Pin and punish** | A grabber holds you, a brute slams the spot | Rescue. Strong; use it rarely, late, and with a long slam tell |

**The layering ladder.** Each new enemy climbs the same steps over a few encounters before it's combined with anything:

1. **Alone:** its one question, in a calm space.
2. **In numbers:** the crowd version of the same question.
3. **With its partner:** one composition.
4. **Two compositions at once.**
5. **With terrain:** a chokepoint, high ground, water.
6. **On defence:** the same enemies against a place you hold.

One new thing per encounter. The battery already teaches this way (the ring, then the flamethrower, Place, then a brute); the ladder makes it the rule for enemies too.

## 3. Encounters that reward defence

These are encounters where you choose the ground and the approaches are visible, so the lull before them matters (pillar 7). Each Sigil and Shield tool gets a job it's best at:

| Tool | Its defensive job |
|---|---|
| Walls and barriers | Shape the approach; close a gap |
| Area casts and fire patches | Hold a chokepoint |
| **Turrets** | Hold a flank over time: presence where you aren't |
| **Glyphs** | Answer a burst at a known spot, once |
| **Orbitals** | Insurance for your own space, automatic |
| **The stored spell** | Banked power you aim when the volley comes |

Encounter shapes:
- **Hold the gate:** waves through one choke. Area spells, walls, glyph lines.
- **Two fronts:** a main push and a smaller flank. A turret or a glyph line holds the flank so you can face the main one.
- **Protect the thing:** a well or a device to keep alive (the battery's pattern).
- **Siege breakers**, so defence never becomes a solved state: sappers lob over walls, the clock forces you out, leapers jump the line, chargers break barriers.

## 4. The Sigil economy

What the code says today: a turret fires its spell uncharged at half price, every turret together spends at most 13 % of your regen from its main element, and it binds one Sigil rune. **No device has health, and enemies never target one**: they chase the nearest wizard or a Double. So a turret is presence without exposure. In Survive the lull refills every pool, so the runes a turret spends are runes you'd have wasted. That's why it feels strong there.

Options, not exclusive:
- **(a) Devices can be hurt, and enemies go for them.** A turret has health; an enemy targets one when it's much nearer than any wizard; sappers and leapers prefer devices. A turret then holds a flank *if you tend it*, and encounters gain a way to pressure a turtle.
- **(b) Turrets draw attention** like a weak Double, pulling enemies off you: a different tool, closer to a decoy.
- **(c) Leave turrets alone and make the runes scarce:** rune-limited encounters and a partial refill between Survive waves make every rune a turret spends a real choice.
- **(d) Retune the share** (13 % of R) or the half price.

Recommended: **(a) with (c)**, and no other retune until there are defensive encounters to test against. Destructible devices are what turn "a flank holder" from a statement into a decision, and scarcity is the honest limit on any banked or automatic spell. The rest of the user's read stands as the design intent: orbitals are automation that can misfire, the stored spell is flexible banked power, turrets buy presence and burst, glyphs are banked power left in a place.

## Next step

A small test encounter in the sandbox once the engine rework's phase 2 lands: three chargers (or goblins with tokens) at random, staggered and as a volley, and two fronts with a destructible turret. It's the cheapest way to feel the demand budget and the turret change.

## Questions (for the user, when the roster has been read)

1. Volleys: should synchronised peaks exist as announced tests of preparation, with staggering as the default? (Recommended: yes.)
2. Turrets: destructible and targeted (a), runes made scarcer (c), both (recommended), or neither for now?
3. The layering ladder as the rule for introducing every enemy? (Recommended: yes.)
4. Survive's lull refill: keep a full refill, or a partial one so runes stay scarce? (Not recommended either way yet; it's a question to play-test.)
