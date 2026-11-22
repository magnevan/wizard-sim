# Ice rework: the stream, the lance, and Ice higher in the form order

2026-11-22. From issues [#9](https://github.com/magnevan/wizard-sim/issues/9) (the basic Ice cast isn't fun) and [#8](https://github.com/magnevan/wizard-sim/issues/8) (the Ice bow's Heavy is just three clicks). The user's direction: try a machine gun of shards, "an alternate version of beam", and make the bow's Heavy a large piercing shard. Moving Ice up the form order is an exploration only. Built on branch `worktree-ice-rework`; see "As built" below. Decision: [Ice Force is the Shard stream; the bow's Heavy is a lance](../decisions/README.md#2026-11-22-ice-force-is-the-shard-stream-the-ice-bows-heavy-is-a-lance-explorations2026-11-22-ice-reworkmd).

## What was wrong

**The Ice shards (Ice Force)** were a one-shot shotgun: five shards (six with a second Ice) in a fan 0.035 turns apart. Up close they all landed. At the range you actually fight from, they spread about 1.3 u apart at 6 u, so a goblin (radius about 0.5) took one shard of five. In the hands it felt underpowered: you aimed, pressed, and watched most of the shards fly past. Pressing again only repeated the miss. Nothing about the cast rewarded aiming better.

**The bow's Heavy** drew a fan of three icicles. At range only the middle one landed, so a full draw did about what one Strike does, for two uses and a second of drawing. When all three did land (point blank) it was three Strikes in one, and the user's note was exact: you may as well click three times.

## Ice Force: the options

Each option is judged by how it feels to hold and what a partner sees.

| | Option | Feel in the hands | What it costs | Verdict |
|---|---|---|---|---|
| A | **Shard stream** (channel): a shard every 0.1 s along your aim, loose at first and tightening as you hold | You hold Force and walk it onto the target; you lead runners, and sweep it across a pack | Another channel beside the beam, sprays and arc: Force-and-hold now covers most elements | **Built** |
| B | **Converging volley**: the one-shot fan focuses at the cursor's distance (the note in #9: "maybe based on how far you aim") | Aim at a goblin and every shard meets on it; aim close for a wide spray | Turns aim distance into a second input on Force, which nothing else reads that way (the burst already does, on Weapon); still a tap-and-wait rhythm | A good fallback if A feels too much like the beam |
| C | **Spin-up gatling**: A, but the rate climbs from slow to fast over the first second | Commitment: you start firing before the enemy arrives; preparation pays (pillar 7) | Weak at the start of a fight, when you most need it; a hidden ramp the player has to learn | A variant of A to try if A feels flat. A's tightening spread is a softer spin-up already |
| D | **Ice lance on Force** (hold to charge one piercing shard) | Big, satisfying hit | It's the Earth rock's charge and now the bow's Heavy too: three verbs doing one job | Rejected: the lance belongs to the bow |
| E | **Keep the shotgun, make it close-range** (shorter, much harder) | Point-blank blast | The Ice burst (Weapon) and the ring already own close range | Rejected |

### Why A, and how it differs from the beam

The Arcane beam is instant and hits the first body along its line at 30 u, and only that body. The stream is a hose of missiles:

- **Travel time.** Shards fly at 30 u/s for 10 u. Against a runner you lead the target; against a slow brute it lands nearly all of it. The beam needs no leading.
- **Sweep, not pierce.** Each shard stops at the first body it meets, but each shard is its own hit. Sweep the stream across a pack and every goblin in the arc takes some. The beam can't spread damage that way.
- **Things stop it.** Walls, barriers, a raised guard and a mirror ward (which turns shards back at you) stop it shard by shard. A friend's coated force field lends each shard its elements as it passes.
- **Short.** At 10 u against the beam's 30, it's a mid-range weapon. It's quicker and more forgiving than Lightning's arc and travels further than a spray.
- **Spin-up.** It starts loose (±0.03 turns) and settles to ±0.006 over 0.6 s. A held, steady stream is accurate, and a twitchy one sprays.

For a co-op partner, a stream reads as a visible line of shards with a gap between them. Friendly fire stays (pillar 3). Each shard hits whatever it meets first, ally or not, and a partner can step out of the line between two shards.

**The trade-off:** six of the ten elements already cast a channel on Force (Arcane, Lightning, Fire, Water, Cold, and Life's beam), and with Ice seven; only Earth, Shield and Sigil don't. Force-and-hold is becoming the default verb. The stream earns its place by being the only channel made of missiles (dodgeable, sweepable, blockable one hit at a time). If play shows it reads as "the beam again", B is the fallback: it keeps Ice a one-shot.

### Numbers (as built)

Measured in the sim (1 Ice is two runes, a Water and a Cold):

| Spell, held 2.5 s (its free channel) | at 3 u | at 6 u | at 9 u |
|---|---|---|---|
| Shard stream, 1 Ice (2 runes) | 74 | 70 | 64 |
| Shard stream, 2 Ice (4 runes) | 125 | 120 | 109 |
| Arcane beam, 1 Arcane (1 rune) | 37 | 37 | 37 |

That is about 35 a rune for the stream against 37 for the beam. It matches the beam rune for rune, as `iceBlast` already does for the ring. It loses a little at range to the spread, and a lot against movers, which the table doesn't show. Each shard carries 0.1 s of the channel's damage times `streamPower` (2), about 3.2 for one Ice. All the numbers are in F2 Tune under `shapes.stream*`.

## The bow's Heavy: the lance

One big icicle in place of the fan. It pierces every body in its line at any draw, and the draw makes it harder (0.6 to 1 × `arms.lanceScale`, 1.5 at a full draw, against a Strike's 0.45), wider (radius up to 0.35 u, against an arrow's 0.15) and longer-flying (to 1.1 s). Walls still stop it.

- **Why it beats three clicks:** on one target a full draw is 1.5× an Ice hit, against 0.9× for the two Strikes the same two uses would buy. On a line of three goblins (a corridor, the battery's lanes, the shieldbearer's escorts) it's 4.5×.
- **What a partner sees:** a long shard with a trail and its own light, clearly bigger than the quick icicles. While you draw, a glow gathers at the bow's tip and grows with the draw (it replaced the old "full draw" glint).
- **Cost:** the bow loses its only spread shot, so its whole kit (Strike, lance, Splinter shot) is single-line. The Splinter shot is the bow's crowd answer now: it bursts into shards where it lands.

## Ice higher in the form order

Today the strongest element picks the form: Shield / Sigil > Life > Earth > Arcane > **Ice** > Lightning > the sprays. "Moving Ice up" means Ice would lead spells it now only colours. The Atlas audit, run with each order (`rules-c.js` loaded with its `PRIORITY` line rewritten and every queue's cell compared, by a throwaway script):

| Order | Cells | Distinct spells | Inert additions | What changes |
|---|---|---|---|---|
| Now | 43 | 944 | 0 / 9090 | – |
| Ice > Arcane | 43 | 944 | 0 / 9090 | 38 Force queues: the Ice beam (34), Frost, Lightning and Water beams with an Ice in them (11) become Shard streams carrying Arcane; the same on Area, Place and Weapon (the Arcane nova, blast and burst with Ice become the Ice ring, Caltrops and the Ice burst) |
| Ice > Earth | 43 | 944 | 0 / 9090 | All of the above, plus every Earth spell with an Ice: the Ice boulder, the three fast ice shards (Earth + Water + Cold), Mud ball, Frost boulder, Arcane boulder with Ice; the Ice quake and geyser |
| Ice > Life | 43 | 944 | 0 / 9090 | All of the above, plus every heal with an Ice: the Healing shards, Healing ring, spring and palm with Ice become harmful Ice spells |

The counts don't move, because a moved queue becomes an Ice cell carrying the old leader as payload, and that still counts as a distinct spell. The real question is what each moved spell *is*.

**Ice > Arcane (recommended, if Ice moves at all).**
- *Gains:* with the stream built, the Ice beam (Arcane + Ice) and the Shard stream are two held channels of ice damage. That redundancy is the strongest argument for the move. Arcane as a payload carries a real shape change, **Burst**: each shard would burst where it lands, giving an exploding-shard stream, a new verb. On Area it becomes an Ice ring that bursts, and on Place, caltrops that burst.
- *Loses:* the Ice beam's reach (30 u against 10) and the Arcane nova and blast shapes whenever an Ice is in the spell. Arcane + Ice + Lightning + Lightning stops being a beam that chains and becomes a stream that chains.
- *Pillars:* fine for pillar 2. The language stays readable ("Ice makes shards; what else is in them changes how they hit"). It takes the long-range option away from Ice, which suits its identity of quick flight at mid range.

**Ice > Earth (not recommended).** Earth carries no shape change as a payload, so Earth + Ice would be a stream of slightly heavier shards. That's an inert-feeling addition the audit can't see: it counts a new payload, but nothing changes in the hands. It would also undo the three fast ice shards the user asked for (2026-11-11), and the charge (hold to throw harder) leaves every Earth + Ice spell.

**Ice > Life (rejected).** Life leads every spell but Shield and Sigil, so every heal stays a heal. With Ice above it, Life + Ice would hurt whoever it touches. That breaks pillar 3 (empowering an ally is something you set up on purpose, and a heal mixed with Ice would strike them). It also deletes the Healing shards, which seek hurt allies.

**What "controls the form more" buys:** two things move together. The first is fewer runes to reach an Ice spell (an Arcane no longer steals the form). The second is that Arcane in an Ice spell becomes a modifier. The cost is the Ice beam and Arcane's own shapes whenever Ice is present. Ice > Arcane is a one-line change in `rules-c.js` (`PRIORITY`) plus `compile.ts`'s switch, plus a check that `p.mod === 'burst'` on a shard reads well (it would burst 10 times a second; it may need a share per shard).

## Open questions (Claude's pick first)

1. **Does the stream feel like Ice, or like the beam again?** Pick: keep it; if it reads as the beam, try B (the converging volley) next.
2. **Should the stream tighten (as built), spin up its rate (C), or neither?** Pick: as built; it tightens.
3. **Move Ice above Arcane?** Pick: yes, after the stream has been played. It resolves the Ice beam/stream overlap, and Arcane bursts are a new verb. Not above Earth, never above Life.
4. **Should the lance pierce only from a partial draw on, like the wand's charged bolt?** Pick: no. It always pierces, because piercing is its identity; the draw buys power and size.

## As built

- `compile.ts`: Ice-led Force is `stream`, a channel. Life + Ice keeps the `shards` volley (Healing shards).
- `effects.ts` `channelTick`: the stream branch. It fires a shard every `streamGap` by the channel's own clock, so the Double, turrets and Survive's Echo keep their cadence. Its aim wobble is a low-discrepancy walk with no rng, so it stays deterministic.
- `config.ts` `SHAPES.stream*` and `ARMS.lance*` (the fan's `fan*` fields are gone). `hands.ts` `lance`. The client draws shards bigger by their radius (`art/vfx.ts`), and the bow's draw glow grows (`view-structures.ts`). The help panel shows the stream per second (`help-model.ts`).
- Rules text: `tools/spell-atlas/rules-c.js` (Shard stream, the bow) and `npm run sync-rules`. Atlas: 43 cells, 944 spells, 0 inert, unchanged.
- Golden hash re-recorded (`ca350d7c` → `81800b89`). With only Ice Force reverted the old hash returned, so the change is the stream's.

## Round 2: the user's notes on the stream

The user liked the stream and asked what its DPS was ("it might be a bit high"). They also asked for three more things: extra Ice runes should fire faster rather than harder, the base should come down, and the stream should have a channel cost like beams. They also suggested trying a version where the ice arches out before racing to the target.

**The first build's DPS**, which was high: 1 Ice about 28/s, 2 Ice about 48/s, against 15/s for a one-rune Arcane beam and 25/s for two.

**Built:**
- **Fire rate grows with Ice.** At one Ice the stream fires `streamRate` 7 shards a second. Each extra Ice raises the rate on Ice's form curve (+70% a rune: about 12/s at two, 17/s at three), and each shard is lighter to match. More Ice reads as a faster gun, not bigger shards.
- **Lower base:** `streamPower` 2 → 1.3.
- **The arc, on trial** (`shapes.streamArc` in F2 Tune, off by default). Each shard leaves to one side (alternating), slow, then curves onto the cursor point while speeding up, and flies straight once past it. The shards meet at the cursor's distance, so aiming further focuses them further out. This is the converging-volley idea from #9 in a held form.

**Measured (sim, a still dummy, 2.5 s held), damage a second:**

| | at 3 u | at 6 u | at 9 u |
|---|---|---|---|
| Stream, 1 Ice | 19.0 | 17.8 | 17.8 |
| Stream, 2 Ice | 32.1 | 30.9 | 28.5 |
| Stream, 3 Ice | 45.2 | 44.0 | 40.4 |
| Arcane beam, 1 | 14.7 | 14.7 | 14.7 |
| Arcane beam, 2 | 24.7 | 24.7 | 24.7 |

The arc lands the same on a dummy at the cursor; it differs on movers and off-cursor targets. Per rune paid, one Ice (two runes) is about 9/s against the beam's 15. Per slot in the queue, it's 1.2–1.3 × the beam: the price of travel time and misses.

**The channel cost already applied.** It's the same rule as beams (`cast.ts`): past the free 2.5 s every rune in the channel costs `RHYTHM.upkeep` (0.4 a second) from its own pool, and an Ice pays from Water *and* Cold. Held 8 s, a one-rune stream and a one-rune beam both stay topped up, because regen outpaces upkeep. A 3-Ice stream ran Water and Cold dry and stopped. A 3-Arcane beam kept going, because it draws its 1.2 a second from one pool and the stream from two. A test now pins it.

**Open:** does the arc earn its place? It looks livelier and focuses at the cursor, but it no longer goes where the shards point, and sweeping a pack gets harder. Pick: keep it off until the user has tried it (F2 › Spell shapes › streamArc = 1); if it wins, it becomes the default and `streamSpread` matters less.

## Round 3: priced as two runes

The user: the stream should hit "more similar to two runes, because that's how much of the regen we are using"; reaching a higher top damage is fine. So `streamPower` is 1.3 → 1.7, the factor a second rune adds to a beam (1 + 0.7). Measured as above, damage a second at 3 / 6 / 9 u:

| | at 3 u | at 6 u | at 9 u |
|---|---|---|---|
| Stream, 1 Ice (2 runes) | 24.9 | 23.3 | 23.3 |
| Arcane beam, 2 Arcane | 24.7 | 24.7 | 24.7 |
| Stream, 2 Ice (4 runes) | 42.0 | 40.4 | 37.3 |
| Arcane beam, 4 Arcane | 43.3 | 43.3 | 43.3 |
| Stream, 3 Ice (6 runes) | 59.1 | 57.5 | 52.8 |

One Ice now pays what it costs. Since a queue holds five slots, three Ice (six runes' worth) gives a top damage no beam reaches. It also pays upkeep on six runes past the free 2.5 s, so it can't hold for long.

## Round 4: a wider arc, more lanes, a beam's reach, five Ice

The user: the arc "looks pretty good, but it's a little hard for me to tune the parameters". They asked for the shards to arc out a little further, and for the stream to jump from 2 to 4 or 6 streams past a number of runes. Then, mid-build: the range should be "probably unbounded, similar to beams"; and a bug, "I can't go to 5 runes with ice, it caps at 4".

- **One knob for the bow.** The first arc steered on a turning rate from a launch angle. Two coupled numbers made it hard to tune, and worse, a wide bow couldn't come round onto a near cursor: the cursor sat inside the shard's turning circle. With the bow at 2.5 u, at 3 and 6 u it landed 3 and 0 damage a second. Now each shard flies a quadratic curve from the hand to the cursor where it left, bowing out exactly `streamArcWidth` (2.5 u) at its widest, capped at 0.45 × the aim distance. It always arrives, then flies straight on along its last heading.
- **Lanes by Ice:** 2 lanes at one Ice, 4 from `streamLanes4At` (2), 6 from `streamLanes6At` (3). The shards take turns across them, and the inner lanes bow a third or half as far as the outer ones.
- **Reach 30 u**, a beam's (`streamRange`, was 10).
- **Five Ice:** an Ice is a Water and a Cold, and both pools held 4, so the queue stopped at four Ice. Water and Cold now hold 5, like Fire. The cost: five-Water and five-Cold spells are possible too, and both carry a little more reserve.
- The arc is **on by default** (`streamArc` 1; 0 is the straight stream).

**Measured** (a still dummy at the cursor, inside the room, 2.5 s held), damage a second:

| | 3 u | 6 u | 9 u | 15 u | 20 u |
|---|---|---|---|---|---|
| Arc, 1 Ice | 24.9 | 24.9 | 23.3 | 20.2 | 17.1 |
| Arc, 2 Ice | 42.0 | 40.4 | 40.4 | 35.7 | 29.5 |
| Arc, 3 Ice | 59.1 | 57.5 | 56.0 | 51.3 | 42.0 |
| Arc, 4 Ice | 74.6 | 73.1 | 71.5 | 65.3 | 51.3 |
| Straight, 1 Ice | 24.9 | 23.3 | 23.3 | 20.2 | 14.0 |

The drop at range is flight time inside the 2.5 s window, not misses. The arc lands as well as the straight stream on a target at the cursor, slightly better at range because the curve corrects the spread. Its cost is the other way round: a target nearer than the cursor sees the lanes cross past it.

