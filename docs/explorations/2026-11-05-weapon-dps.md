# 2026-11-05: Weapon DPS against spells, and extras you can see

Two notes from the user's play-test:

- **A.** "The arcane wand feels a bit too powerful. You can spam it very fast, leading to high dps for very low cost. I'm getting a much higher dps with wand spam vs the beam."
- **B.** "I also am not seeing enough visual difference based on any extra elements I add." This was first about the wand (Sigil + Arcane + Fire, + Cold, + Lightning), then about every weapon ("can't tell it's not just a water trident except for the effect on targets"), and then the guards too.

## The measurement

`npm run balance:weapons` (in `game/`; the pilot is `game/tools/weapon-dps.ts`, the report `game/tools/weapon-dps-report.json`) runs one wizard against one sturdy target for 10 s and 30 s. Each run starts from full pools under the current shared regen (R = 1.0). The pilot repeats one thing as fast as the game lets it:

- **A weapon move.** It conjures the weapon (Sigil + its element, then Weapon) and uses the move until the uses run out, then conjures again. The conjure's runes are counted, so its cost is spread over its uses. A Strike is mashed, with taps landing in the cast buffer during recovery. The staff costs nothing.
- **A spell.** It queues the spell as soon as the pools can pay, then casts it. Channels are held for their free natural duration, and Earth Force is fully charged.

The target is put back on its spot every tick, so knockback can't take it out of reach. Its statuses (burning, wet) are left to run. The comparison spell for each weapon is the same element's one-rune Force.

DPS over 10 s and 30 s, before and after the fix. Runes and damage per rune are for the 30 s run after the fix.

| Row | before 10 s | before 30 s | after 10 s | after 30 s | runes (30 s) | dmg / rune | after vs spell |
|---|---|---|---|---|---|---|---|
| staff Strike | 25.8 | 25.8 | 6.4 | 6.3 | 0 | free | 47% of Arcane beam |
| staff Heavy | 7.5 | 7.4 | 5 | 5 | 0 | free | 37% |
| staff Sweep | 20.6 | 20.6 | 5.1 | 5 | 0 | free | 37% |
| **Arcane wand Strike** | **31** | **30.7** | **7.7** | **7.4** | 4 | 55 | **55% of Arcane beam** |
| Arcane wand Heavy | 11.8 | 11.6 | 8 | 7.9 | 4 | 59 | 59% |
| Flame sword Strike | 56.7 | 56.3 | 12 | 12 | 4 | 90 | 108% of Fire spray (see below) |
| Flame sword Heavy | 10.9 | 11.3 | 8.5 | 8.9 | 4 | 67 | 80% |
| Flame sword Sweep | 40.9 | 41.2 | 10.8 | 10.5 | 6 | 53 | 95% |
| Stone maul Strike | 92.9 | 92.2 | 9.1 | 9.1 | 2 | 137 | 59% of Earth rock |
| Stone maul Heavy | 20.8 | 20.4 | 11.9 | 11.6 | 4 | 87 | 76% (43% of Earth rock x2) |
| Stone maul Sweep | 63.9 | 64.5 | 7.3 | 7.3 | 4 | 55 | 48% |
| Frost spear Strike | 51.6 | 51.2 | 7.2 | 6.9 | 4 | 52 | 164% of Ice shards (see below) |
| Frost spear Heavy (dash) | 6.1 | 4.2 | 6.1 | 4.2 | 4 | 32 | 100% |
| Lightning whip Strike | 51.6 | 51.2 | 11.2 | 10.9 | 4 | 82 | 53% of Lightning arc |
| Lightning whip Heavy | 9.7 | 9.5 | 9.7 | 9.5 | 4 | 71 | 46% |
| Lightning whip Sweep | 35.5 | 35.8 | 8.3 | 8.3 | 6 | 42 | 40% |
| Tide trident Strike | 30.1 | 29.9 | 7.5 | 7.2 | 4 | 54 | (Water deals no damage) |
| Tide trident Heavy | 0 | 0 | 0 | 0 | 4 | 0 | the slash shoves and soaks |
| Tide trident Sweep | 20.7 | 20.9 | 5.6 | 5.5 | 6 | 27 | |
| Arcane beam | 13.5 | 13.5 | 13.5 | 13.5 | 11 | 37 | |
| Arcane beam x2 | 14.7 | 14.5 | 14.7 | 14.5 | 12 | 36 | |
| Fire spray | 11.2 | 11.1 | 11.2 | 11.1 | 11 | 30 | |
| Fire spray x2 | 13.1 | 13 | 13.1 | 13 | 22 | 18 | |
| Earth rock | 15.4 | 15.3 | 15.4 | 15.3 | 21 | 22 | |
| Earth rock x2 | 31.1 | 27 | 31.1 | 27 | 26 | 31 | |
| Ice shards | 4.2 | 4.2 | 4.2 | 4.2 | 11 | 12 | |
| Lightning arc | 20.5 | 20.5 | 20.5 | 20.5 | 11 | 56 | |

**What it showed.** The user was right, and it wasn't only the wand. Every Strike recovered in RHYTHM.recovery (0.18 s), so a mashed Strike landed about 4.3 times a second. Thirty uses cost 2 runes, which is nearly free. The wand did 2.3 times the beam's DPS. The maul did 6 times the rock's. Even the free staff out-damaged every one-rune spell. Heavies were the weakest way to use a weapon.

## The principle

**A weapon is the cheap, always-ready option, so its sustained DPS sits clearly below a committed spell of the same element.** The target is a spammed Strike at about 50–60% of that spell. A Heavy hits harder per move but comes slower. The wand must not out-damage the beam.

## The fix: each weapon has its own Strike rhythm

`ARMS.strikeRecovery` sets the recovery after a Strike or a Sweep, per weapon:

| staff | Healing hands | trident | whip | wand | sword | spear | maul |
|---|---|---|---|---|---|---|---|
| 0.6 s | 0.35 s | 0.65 s | 0.68 s | 0.62 s | 0.8 s | 0.9 s | 1.4 s |

This keeps pillar 4 ("casting rhythm is explicit and consistent, not hidden input cooldowns"). The recovery is the existing recovery phase, the one spells already have, with a per-weapon length. It is drawn: the weapon thrusts out fast, holds a beat, then swings back to rest over its recovery. A partner can see the maul's slow follow-through and the wand's quick flick. A press during the follow-through waits in the cast buffer as before, so no input is lost.

Damage changes that come with it:

- **Blow physical damage:** staff 4, trident 5, spear 4, whip 3, sword 2, maul 2 (was 6/7/8/4/7/4).
- **A blow's share of its elements** (`ARMS.blowPayload`): 0.5 of a spell's power (was 0.8).
- **The wand's bolts:** a Strike's light bolt is 0.3 of a spell (was 0.45), and a full Heavy bolt 0.75 (was 1.1).
- **Weapon waves** (`waveScale`: the trident slash, the flame crescent, the maul's fissure): 0.8 (was 1.4).

After the fix:

- The wand's Strike is 55% of the beam, and its Heavy 59%.
- The whip's Strike is 53% of the arc.
- The maul's Strike is 59% of the rock.
- The staff is 47% of the beam, for free.

**Two exceptions, and why:**

- **Flame sword (108% of Fire spray).** Burning is a 6 DPS floor that any igniting touch sets, and it refreshes rather than stacks. Fire spray x1 is regen-limited to 11 DPS, and about half of that is the same burning. So no Strike rhythm short of absurd puts the sword at 55% of the spray: the sword's own hits add only about 6 DPS on top of the burn. This says more about Fire spray x1 being weak than about the sword. Open question below.
- **Frost spear (164% of Ice shards).** Cold spells deal little damage by design (their value is chill and freeze), so the spear is compared with a very low number. At 6.9 DPS it is below the wand and the whip, which is where a control weapon belongs.

## Extras you can see (note B)

One shared system, `game/packages/client/src/art/accent.ts`, shows every element a weapon or guard carries besides its lead. Every weapon and guard uses it, and every extra gets equal weight:

- **On the held weapon**, each extra adds a band of its colour along the blade (with a light running along it), a glow at the tip and its own particles. Fire licks and embers rise, frost rime crusts the blade, lightning crackles between points on it, water drips, stone chunks sit in it, arcane rune sparks drift up and life motes rise.
  - **The wand's orb** gets a turning ring in the extras' colours.
  - **The Healing hands** get the ring round each hand.
- **In every move**, each extra lays a stripe beside the Strike's thrust and throws its bits off at the tip.
  - The Sweep's ring gets an outer band per extra.
  - The Heavies (dash, lash, waves, charged bolt, javelin) trail their extras along their path or burst them where they happen.
- **The wand's bolts** stay violet at the heart, and each extra changes the bolt its own way:
  - Fire: a flaming streak behind it.
  - Cold: an icy shard for a head.
  - Lightning: crackle round it.
  - Water: a droplet trail.
  - Earth: a stone pebble at its heart.
  - Life and Arcane: motes.
- **Guards:** the faint dotted coat rim is replaced by a thick arc of the rim per extra, in its colour, turning, with its bits shed off it. A glow of the strongest extra lights the floor. While blocking, the ends of the energy face show the extras' colours. Every guard move (parry, block, break, Retreats, the Lance, the flame burst) bursts or trails the guard's extras.

Screenshots looked at: wand + Fire (the bolt as a flaming streak, a fire ring on the orb), wand + Cold (an ice-shard bolt, a frost ring), trident + Fire and + Cold, whip + Fire (Sigil + Fire + Lightning makes the whip, since Lightning leads by type), sword + Water, maul + Arcane Sweep, Bulwark + Fire, Prism + Lightning, Leaf + Earth, Tide + Cold.

## Open questions

1. **Fire spray x1 vs burning.** Should Fire spray x1 hit harder, so a flame sword can sit below it? Or should weapon blows ignite for a shorter time? Recommendation: leave the sword and look at Fire spray in the balance pass. The sword's 12 DPS is below every two-rune spell.
2. **"Sigil + Fire + Lightning" is a whip, not a flame sword.** Lightning leads by type, so a "flame sword with lightning" can't be made today. Is that what the user expected? It's the same rule as guards and spells.
3. **Heavies and Sweeps** now sit at or below the Strike's DPS except the maul's fissure (76% of the rock, and it hits a whole lane). Is a Heavy that is about as good as mashing, but hits harder per move, the right feel?
