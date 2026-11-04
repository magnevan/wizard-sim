# Magicka: gameplay numbers

These numbers are meant as a balance baseline. They were gathered on 2026-11-04 from fan wikis, Steam guides and forum threads, without opening any game files. Most of them come from the Magickapedia (magicka.fandom.com), which is community-edited and doesn't always say which game or patch a number belongs to. Unless a row says otherwise, assume **Magicka 1 (2011)**. *(unverified)* marks values that no source confirmed. "WW" means Magicka: Wizard Wars, the PvP spin-off. Its numbers are included only where nothing else was found.

Fandom pages could only be read through search-result excerpts, not opened directly, so the tables there came through garbled and some pairings of value and element are uncertain.

## 1. Damage per element and shape

**Scaling pattern (my derivation from the wiki's stacked values):** fluids and novas scale with the **square root of the stack count**. Earth rocks follow **triangular numbers** (1, 3, 6, 10, 15). Ice shards scale as **n²**.

| Shape | Element | 1 stack | 2 / 3 / 4 / 5 stacks | Notes | Src |
|---|---|---|---|---|---|
| Spray (per hit) | Steam | 70 | 99 / 121.2 / 140 / 156.5 | wets; √n scaling | [1] |
| Spray (per hit) | Fire | 15 | 21.2 / 26 / 30 / 33.5 | ignites; √n | [1] |
| Spray | Water, Cold | 0 | 0 | Water adds range and knockback; Cold chills | [1][3] |
| Spray / lightning (per hit) | Lightning | 31.25 | higher with more stacks | the excerpt's row pairing is unclear | [1] |
| Spray duration | all | — | — | up to 16 hits, in steps of 2 hits | [1] |
| Beam (per hit) | Arcane | 106.25 | same per hit; **+8 hits** of duration per extra element | base duration 11 hits | [1][3] |
| Beam (per hit) | Life (heal) | ~89 | same per hit; +8 hits | | [1] |
| Beam add-on (per hit) | Steam / Fire / Cold | 90 / 30 / 12.5 | | Lightning doubles the whole beam's damage on wet targets | [1] |
| Beam, best combos | QFASSS | ~35,100 total over 15.8 s ≈ **2,223 DPS** | | old patch, noisy measurement | [9] |
| Beam, best combos | QFQFAAS | ≈ **2,790 DPS**, shorter | | | [9] |
| Projectile (rock) | Earth | 75 | 225 / 450 / 750 / 1125 | ×4.4 at full charge (1125 → 4950) | [1][10] |
| Projectile (shards) | Ice | 137.5 | 550 / 1237.5 / 2200 (for 2–4) | Ice turns Earth damage into Ice damage | [10] |
| Nova (area) | Arcane | 425 | same damage, larger radius | | [1] |
| Nova (area) | Ice | 275 | … 615 at 5 (√n) | | [1] |
| Nova (area) | Arcane + Cold | 475 (1425 if wet) | | chills | [1] |
| Weapon imbue | Earthquake | ~1000 | +100 per extra Ice | area-cast quake is ~500 | [4] |

The LP tutorial says extra elements on a beam or nova add duration or radius, not damage per hit. Extra elements on sprays and explosions add both range and damage [3].

## 2. Status effects

| Status | Rule | Numbers | Src |
|---|---|---|---|
| Wet | Lightning deals 2× damage to wet targets. Cold freezes them. A wet caster can't cast Lightning. | Each Lightning element queued while wet hits the caster for **250**. | [2][4][5] |
| Wet (WW, patch of 2014-03-18) | Gives 2× Lightning *and* Cold damage for 0.5 s, then Wet is removed on the first damage tick | — | [6] |
| Burning | Stacks with repeated contact, then fades soon after contact ends. Removes Wet and Chill. Can cause panic. | **Sources disagree:** "stacks up to 120 per tick" [2] vs "starts at 40 and stacks up to 1200 per second" [4]. These fit together if there are about 10 ticks a second *(unverified)*. | [2][4][3] |
| Chilled | Slows movement, attacks and casting. Removes Burning. Thaws over time. | animations run at 1/3 speed [4]; duration *(unverified)* | [2][4] |
| Frozen | Wet + Cold. Can't move, though a frozen wizard can still self-cast. Fire or the timer ends it, and more Cold restarts the timer. | **Sources disagree on the multiplier:** 3× arcane/physical [2][4], 2× physical [7], 3× all damage [3]. Lasts "a few seconds" *(unverified)*. | |
| Shocked | Very short stun, reapplied on every Lightning hit | — | [3] |
| Armored targets | Lightning deals +50% | | [5] |

## 3. Big hits (Magicks) for scale

| Magick | Damage / effect | Src |
|---|---|---|
| Thunder Bolt | 5000 (7500 vs armored) | [5][4] |
| Chain Lightning | 800–850 (1700 vs wet) | [5][4] |
| Meteor Shower | 17 s, ~35 meteors, ~10k per direct hit | [4] |
| Haste / Time Warp | 2× move speed for 10 s / 50% time scale for 15 s | [4][11] |

**Cost and cooldown, Magicka 1:** no resource. The only cost is the time it takes to type the element recipe and press Space; no cooldown was found *(unverified)* [11]. **Magicka 2:** casting any magick from elements starts a shared ~3 s lockout [12]. Quick-slot casting has per-tier cooldowns, which a patch shortened for tiers 2–4; the actual values weren't found [12].

## 4. Player health, healing, wards

| Item | Value | Src |
|---|---|---|
| Wizard HP, default robe | 1000 (Revive's "10%" works out to 100) | [8][13] |
| WW default HP | 1500 | [14] |
| Magicka 2 wizard HP | not found; artifacts can scale it to 15/50/75/200% or make wizards immortal | [15] |
| Self-cast, 1 Life | heals 179. More Life spreads the heal over several seconds instead of raising the total. | [1] |
| Life beam | ~89 per hit (see table 1) | [1] |
| Heal mine | 599 [8] vs ~2500 for WE mines [4] (probably different stack counts) | |
| Stone armour (self, Earth + element) | absorbs 1500, −30% physical (EDDDD: −60%) | [4] |
| Ward (WW) | 1 copy of an element = 50% resistance + immunity to its status; 2 copies = 100%. Ice and Steam wards give 100% to the combined element and 50% to each base element. | [14] |
| Magicka 2 aura | Shield + one element type, self-cast, absorbs all damage of that element for ~15 s. Status immunity needs 2 copies. | [14][15] |
| Pure shield | loses HP over time; tapping Space reinforces it | [3] |

## 5. Cast rhythm

| Item | Value | Src |
|---|---|---|
| Time between element inputs | none found; inputs are effectively instant. AutoHotkey users needed small delays between keys. *(unverified)* | [11] |
| Spray length | up to 16 hits | [1] |
| Beam length | 11 hits + 8 per extra element (5 Arcane = 43 hits). One measured beam lasted 15.8 s. | [1][9] |
| Rock charge | ×4.4 damage at full charge; charge time in seconds not found *(unverified)* | [10] |
| Missile rate | up to 8 a second | [4] |

## 6. Enemies

| Enemy | M1 HP | M2 HP (normal) | Notes | Src |
|---|---|---|---|---|
| Goblin Rogue | 700 | 520 | weak to fire; travels in packs, can grapple | [16][17] |
| Goblin Warrior / Captain | 100+900 / 150+2200 | — | the first number is a shield that breaks off | [13] |
| Goblin Shaman / Wizard | 3000 (Wizard) | 1200 (Shaman) | | [13][17] |
| Orc Scout / Berserker | 2200 / 2500 | 1120 (club orc) | | [13][17] |
| Orc Warrior | 250+2200+2200 | 1600 (shield orc) | shield, then armour, then body | [13][17] |
| Forest Troll | 6000, regen 100/s, Earth ×0.8 | War Troll 6400, regen 100/s | all trolls have at least 6000 HP; Cave Troll 10,000 | [13][18][17] |
| Magicka 2 bosses | — | 3200–6400 | | [17] |

**Enemy damage per hit:** not found in any source *(unverified)*. Trolls have "some form of one-shot" attack [13].

**Difficulty scaling:** Magicka 2 artifacts set enemy HP to 50/125/150/200% [15]. One user comment on [17] gives 2-player HP rising by about 1.25–2.8× (War Troll 6400 → 12,000, Goblin General 3200 → 8100). It's unclear which value is the baseline. No Magicka 1 difficulty multipliers were found *(unverified)*.

## 7. Revive and down rules

- **Revive magick:** brings back a dead ally with 10% max HP (100) after 0.25 s, about 4 units in front of the caster. With several players dead, it picks one by lobby order. The Staff of Life casts it on a 15 s cooldown [13].
- **Summon Phoenix:** revives all players at full HP [4].
- **Full party wipe:** everyone respawns at the last checkpoint [19].
- **Magicka 2:** dead players can "ask for revive" (patch of October 2015). Dead allies also come back automatically after certain fights. Players reported about 2.5 s of invulnerability after a respawn *(anecdotal)* [19][20].
- **WW:** respawn after 3 s at full HP [4].
- There is no downed or bleed-out state. A wizard is either alive or dead.

## How to compare with our per-rune view

Magicka had no rune pool. The only things limiting a spell were the five-slot queue, the time to type it, and how long it lasted.

**Translates directly**
- **Time to kill against player HP.** A 1-stack Steam spray does ~70 per hit, so a 700 HP goblin dies in about 10 hits. That's roughly a full spray. A Forest Troll (6000 HP, 100/s regen) needs focused fire from two or three players. Useful ratios: grunt ≈ **0.7×** wizard HP, elite ≈ **2–3×**, troll ≈ **6×**, boss ≈ **3–6×** (Magicka 2).
- **Per-stack curves.** Treat "one stack" as "one rune". Fluids and novas scale with √n, so the fifth rune adds little damage and mostly buys range or duration. Rocks (triangular) and ice shards (n²) reward going all-in on one element. That's a clean model for us to copy or reject on purpose.
- **Multipliers.** Wet ×2 to Lightning, Frozen ×3 to physical, +50% vs armour. These are ratios, so they carry over whatever our base numbers are.
- **DPS ceilings.** Top beams reach ~2,200–2,800 DPS, about **2–3 wizard-HP per second**. That's why friendly fire is lethal.

**Doesn't translate**
- **Cost.** Magicka paid for spells with input time and exposure. Neither game had mana, and Magicka 1 magicks had no cooldowns. We'd need to measure our costs in runes per kill, not seconds per kill.
- **Hit counts.** The wiki gives durations in hits, and the tick rate isn't documented, so turning hits into DPS is a guess. Only [9] measured it in seconds.
- **Robe and staff modifiers, WW ward numbers, and Magicka 2's slot changes** (for example, spiked ice needs only 2 Ice + 1 Earth in Magicka 2) are separate balance contexts.

## Sources

1. Magickapedia, Spell combinations: https://magicka.fandom.com/wiki/Spell_combinations
2. Magickapedia, Statuses: https://magicka.fandom.com/wiki/Statuses
3. LP Archive, Magicka tutorials 1 and 3: https://lparchive.org/Magicka/Tutorial%201 , https://lparchive.org/Magicka/Tutorial%203/
4. Steam guide "How To Magicka" (now removed from Steam): https://steamcommunity.com/sharedfiles/filedetails/?id=118999253
5. Magickapedia, Elements/Details, Thunder Bolt, Chain Lightning: https://magicka.fandom.com/wiki/Elements/Details , https://magicka.fandom.com/wiki/Thunder_Bolt , https://magicka.fandom.com/wiki/Chain_Lightning
6. Magickapedia, March 18, 2014 Wizard Wars Patch: https://magicka.fandom.com/wiki/March_18,_2014_Wizard_Wars_Patch
7. Magicka archive wiki, Status Buffs: https://magicka-archive.fandom.com/wiki/Status_Buffs
8. TV Tropes, GameBreaker/Magicka: https://tvtropes.org/pmwiki/pmwiki.php/GameBreaker/Magicka
9. Paradox forum, "The Most Powerful Beam": https://forum.paradoxplaza.com/forum/threads/the-most-powerful-beam.522409/
10. GameSkinny, Magicka 2 spell combination guide (labelled Magicka 2, but its numbers match [1]): https://www.gameskinny.com/tips/complete-magicka-2-master-spell-combination-guide/
11. Magickapedia, Magicks (Magicka 1), and magickatips list: https://magicka.fandom.com/wiki/Magicks_(Magicka_1) , https://magickatips.com/2011/02/list-of-magickas-spellbook-spells/
12. Steam guide "Removing Cooldown Between Casting Magicks", and the Magicka 2 discussion thread: https://steamcommunity.com/sharedfiles/filedetails/?id=2477819663 , https://steamcommunity.com/app/238370/discussions/0/615085406653732139
13. Magickapedia, Revive, Goblin, Orc, Troll: https://magicka.fandom.com/wiki/Revive , https://magicka.fandom.com/wiki/Goblin , https://magicka.fandom.com/wiki/Orc , https://magicka.fandom.com/wiki/Troll
14. Steam guide, Wizard Wars Complete Guide v2.5, and the Magicka 2 tips thread: https://steamcommunity.com/sharedfiles/filedetails/?id=186205747 , https://steamcommunity.com/app/238370/discussions/0/1473095965304891184/
15. Magickapedia, Artifacts: https://magicka.fandom.com/wiki/Artifacts
16. Magicka Wiki (Miraheze), Goblin Rogue: https://magicka.miraheze.org/wiki/Goblin_Rogue
17. Steam guide, "Magicka 2 – Enemies and their HP" (normal difficulty, 2022): https://steamcommunity.com/sharedfiles/filedetails/?id=1661248866
18. Magicka Wiki (Miraheze), Forest Troll: https://magicka.miraheze.org/wiki/Forest_Troll
19. Magickapedia, Multiplayer (old revision): https://magicka.fandom.com/wiki/Multiplayer?oldid=7103
20. Steam, Magicka 2 discussion "No invincibility on revive?": https://steamcommunity.com/app/238370/discussions/0/615085406676960157/
