# 2026-11-14: Enemy wizards: tactical enough, beatable on purpose

The user asked for a spec of enemy wizard fights, like Magicka's. The hard part is getting both sides right: an AI that uses spells in a reasonably tactical way, but isn't so good that fighting it stops being fun. Follows `2026-11-14-enemies-and-ai.md`, whose rival wizard and hedge wizard this fills in. Rated on the [Enemy Wizards](https://claude.ai/artifact/CssUe9PniLQRJ4LkKRZo9J) page (`tools/enemy-wizards/`).

## What Magicka did

Sources: Magickapedia (Grimnir, Goblin wizards, Druid, Necromancer, Dwarf priest pages) and carlsguides chapters 4, 6, 8, 10 and 12.

- **Disciples and the Warlock** (ch. 4): beam and soak casters with a personal shield; you break line of sight round the fountain and the machine, and the Disciples hit their own machine if you stand behind it.
- **Goblin wizards, "the Aristocrats"** (ch. 8): about a dozen arrive a few at a time, robes in their element's colour, each with a fixed repertoire. All self-heal, dry or thaw themselves with fire and douse themselves with water. Their casting is loose and hits goblins. Individually easy; the fight is long.
- **Druids**: summon tree spirits, cast Rain on you and then hit you while you're wet. A self-shield keeps the rain off.
- **The Mind Duel** (ch. 6): six rounds of mages on small islands, including a lone wizard who can one-shot you, and dying restarts all six. The walkthrough calls it "the worst fight in Magicka, debatably". It's hard for the wrong reasons: one-shots, ledges and a full restart, not clever casting.
- **Grimnir** (ch. 6 and 12): tornado, conflagration, Rain, thunderbolt, an ice nova, shields and earth walls, and floating projections of himself firing beams and fireballs. **He glows before a big spell, the way your wizard does**; a shield raised on the glow absorbs the conflagration. Everything he casts can be Nullified. The walkthrough compares the fight to taking turns in an old console RPG, and calls it far easier than the Mind Duel.
- **Death** (ch. 10): untouchable except while he winds up an attack, so the wind-up is the opening.

**What to take:** the tells that worked were a glow before the big spell and the wind-up as the only opening. The repertoires were small and fixed per enemy. Magicka's enemy wizards hurting themselves and their own side was part of the fun. What failed was one-shots without a fair tell, plus punishing restarts. Nothing suggests Magicka's wizards were smart; they were readable.

## The principle

**An enemy wizard is a player who has to show its hand.** It plays by the same rules as you: runes from pools on the shared regen budget, the same wind-up and recovery, friendly fire, wet, burning and chill. Its fairness comes from three things you can see and use:

1. **The queue is the tell.** Its runes gather at its staff one at a time, as yours do, at a typing pace slower than a skilled player's. Water, Water… you know what's coming before it's cast.
2. **The commit.** A big spell (four or more runes) adds a focus glow before the wind-up, Grimnir's glow. Once it glows, it's committed.
3. **The recovery.** Every cast ends in a breath, longer after a big one. That's your opening.

It never reads input. It sees the world through a reaction delay, and only what a co-op partner could see.

## One cast, step by step

| Step | What happens | What you can do |
|---|---|---|
| **Notice** | It sees the world as it was a reaction delay ago (0.5 / 0.35 / 0.25 s by tier). | Move: it aims where you were. |
| **Choose** | Scores its plays and picks one, usually the best and sometimes the second best (its "temperature"). Re-decides on a think timer, not every tick. | Bait it: stand wet near its lightning, ward against its favourite. |
| **Queue** | Presses its runes one by one at its pace (2.5 / 4 / 6 runes a second). They gather at its staff in their colours. | Read it: the dodge window opens with the first rune. |
| **Focus** | Big spells only: a 0.6 / 0.45 / 0.35 s glow. | Shield, barrier, Blink, stun it to cancel. |
| **Wind-up** | The player's own: 0.12 s + 0.04 s a rune. | Last chance to sidestep. |
| **Cast** | Aims at the noticed position with an aim error (8° / 4° / 2°); beams turn at a limited rate, so you can outrun one. | Outrun the beam; stand behind its allies. |
| **Recover** | The player's 0.18 s, plus a breath (0.6 / 0.4 / 0.25 s), doubled after a big spell. | Punish. |

From its first rune to impact, flight included, a one-rune poke gives you 0.86 s from an apprentice and 0.63 s from a master. A five-rune signature gives 3.2 s and 1.8 s. Where a spell can hurt badly, the focus glow stretches to meet the 0.8 s floor in rule 3 below, so the shock in Soak and shock gives 0.95 s at every tier. The opening after a cast is 0.78 s from an apprentice and 0.43 s from a master, and 1.38 s and 0.68 s after a signature. The page's duel timeline computes these.

## Plays

A play is one cast or a short named string of casts. The utility layer picks plays, not single spells, so they read as intentions you learn to name. Each wizard carries a few of them.

| Play | Queue you see | When it's chosen | Your answer |
|---|---|---|---|
| **Poke** | 1 to 2 runes, an Arcane bolt or a rock | Filler; nothing better scores | Sidestep |
| **Soak and shock** | Water ×2 on Force, then Lightning | Its target is in range and not warded against lightning | Dry yourself with Fire; ward against Lightning; close in during the gap |
| **Freeze and shatter** | Water, then Cold, then Earth | A target is soaked; Adept and up | Fire breaks the freeze; get out of the puddle |
| **Rain** | Water on Place over you | Two or more of you close together; druid-style | A Shield ward keeps the rain off; scatter |
| **Flame wall** | Shield and Fire on Place | You're closing in; it wants range | Go round; Water or Cold puts it out |
| **Ward up** | Shield and the element you've hit it with most, on Self | Your last few hits were mostly one element | Switch element; it remembers your hits a while, so switching tricks it |
| **Barrier** | Shield on Place, between you | You're channelling a beam at it | Go round; area casts |
| **Blink away** | Shield on Force | Cornered, or low on health, or a big spell of yours is winding up and it saw it | Predict the landing; glyphs |
| **Douse, dry or thaw itself** | Water / Fire on Self | It's burning / wet / frozen | It spent a turn on itself: punish |
| **Mend** | Life on Self | Low health; at most two per fight | Interrupt with a stun; it's open while it heals |
| **Turret** | Sigil and an element | Adept and up, a quiet moment | Break it; it binds a rune the wizard can't use |
| **Signature** | Five runes, with the focus glow | Its big spell, on a long timer | Shield on the glow; punish the long recovery |

The plays use the same grammar and the same casts as yours, and the queue it shows is the real spell. Nothing is a bespoke attack.

## Tactics, kept cheap

- **A range band** per style: the duelist keeps 6 to 9 u, the brawler 3 to 5, the summoner stays behind its allies. It strafes inside the band and backs off when you close.
- **Cover**: a pillar, a wall or its own allies between you when it's recovering.
- **What it knows, by tier** (the counter table): an apprentice knows nothing; an adept knows wet → lightning, burning → douse itself, your ward → switch element; a master also knows freeze and shatter, cancels (Fire beats your Ice) and baiting a puddle.
- **Memory that can be wrong:** it remembers your ward and your favourite element for a few seconds, and keeps using what it remembers. Change your ward and it's briefly wrong. Bungie built Halo's surprise on exactly this.
- **Friendly fire:** it obeys it, so it can soak itself in its own Rain, burn in its own patch, and hit its allies. Apprentices never check for allies in the way (the hedge wizard's comedy), adepts check half the time, masters always.

## Beatable on purpose: the honesty rules

1. **No input reading.** Decisions come from world state through its reaction delay. It reacts to your cast once its wind-up has started, never to the keys you press. Whether it may read the runes gathering at your staff is question 2.
2. **The same economy.** Same pools, regen, wind-up, upkeep. No free casts. It can run dry, and its staff shows it.
3. **The tell grows with the danger.** Anything that can deal 30 or more damage gets at least 0.8 s from first rune to impact. Nothing one-shots a wizard at full health.
4. **Every big spell ends in an opening.**
5. **Mistakes a person would make,** not random ones (the Maia chess result: weak play should look like a weaker human, not a crippled engine). It picks the second-best play at its temperature, is late by its reaction delay, overcommits to a channel, forgets your ward, shocks while standing in its own puddle.
6. **Habits you can learn.** Each named wizard has one or two signatures ("after a Blink it always opens with fire"), deterministic enough to exploit.
7. **No lock-down chains.** After it freezes or stuns a wizard, that wizard can't be frozen or stunned by it again for 4 s.
8. **One new trick per phase** in a boss fight.

## Tiers

The same brain with different numbers. Difficulty moves an encounter by one tier step on these knobs; HP and damage stay as tuned.

| Knob | Apprentice | Adept | Master |
|---|---|---|---|
| Typing pace (runes/s) | 2.5 | 4 | 6 |
| Reaction delay | 0.5 s | 0.35 s | 0.25 s |
| Focus glow (big spells) | 0.6 s | 0.45 s | 0.35 s |
| Breath after a cast | 0.6 s | 0.4 s | 0.25 s |
| Aim error | 8° | 4° | 2° |
| Picks the second-best play | 35 % | 20 % | 10 % |
| Plays it knows | 2 to 3 | 4 to 6 | 6 to 9 |
| Counter table | none | basic | full |
| Checks for allies in the way | never | half | always |
| Rune pools | 2 each | 3 each | 4 each |

## Encounters

- **Hedge wizards in a crowd** (apprentice): a goblin caster among goblins, two plays, often hitting its own side. The common case and the first to build.
- **The duel** (adept, alone, a ring or courtyard): a story beat, with the opponent written by the user (a rival, an examiner, anyone).
- **A coven** (two or three adepts): they share one set-up and payoff token, so one wets and the other shocks, never both at once.
- **A boss** (master, phases, adds): one new play per phase; adds that pressure without crowding the read.

## The same brain as companions

This is the companion brain from `2026-11-14-enemies-and-ai.md` with the team flipped and different weights: plays, utility scores, the honesty rules and the tiers. Building one gives you most of the other.

## What it costs to build

Casting state is per seat today (`MAX_SEATS = 4`: runes, pools, phase, nav fields). Two ways to give an enemy a wizard's hands:

- **AI seats** (recommended): seats 4 to 7 are AI casters, driven inside the sim by an input bot (as `bot.ts` drives a seat now, its memory moved into world state). Every rule works unchanged, and the queue shows at the staff for free. Cost: the per-seat arrays double (the nav flow fields can stay at four), and the hash grows with them. AI inputs are computed in the sim, not sent over the network.
- **A caster component on enemy bodies:** a smaller set of fields for queue, pools and phase, and a cast path that bypasses input. Cheaper per enemy, but it forks the casting code.

This waits for the engine rework's phase 2, like the rest of the new content. Determinism: the "second best" pick draws from the world's seeded RNG; the reaction delay reads a short ring buffer of each wizard's position and statuses; ties break by body index.

## Questions for the user

1. Its runes gather at its staff, as yours do, as the main tell (yes).
2. What it may react to: your casts and the world only (recommended), also the runes gathering at your staff at Master tier, or at every tier.
3. It obeys friendly fire and its own statuses at every tier (yes).
4. AI seats or a caster component (AI seats).
5. The first wizard encounter to build: hedge wizards in a goblin crowd (recommended), a lone duel, or a coven.
6. Difficulty moves an encounter one tier step (recommended), or one global slider over every knob.
7. Named wizards with signature habits, with who they are left to the user (yes).

## Sources

- https://magicka.fandom.com/wiki/Grimnir, /wiki/Goblin (Goblin Wizard, Aristocrats), /wiki/Druid, /wiki/Necromancer, /wiki/Dwarf (read in a browser, 2026-11-14)
- https://carlsguides.com/walkthroughs/magicka/chapter4.php, chapter6.php, chapter8.php, chapter10.php, chapter12.php
- https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf (Butcher and Griesemer, Halo)
- https://www.gamespot.com/articles/develop-08-bungie-ai-guru-lays-out-future-plans/1100-6195280/ (Isla: a target model that can be wrong; smart mistakes)
- https://maiachess.com/blog/introducing_maia (human-shaped mistakes)
- Halo's inaccurate first volleys, fighting-game input reading and Sekiro's punish windows are from memory *(unverified)*.
