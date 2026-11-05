# 2026-11-05: Survive, a wave mode with power-ups between waves

The user asked for "an arena & a survive game mode with waves. There should be some power ups between waves. An easy one is things that gives you more max rune slots, regen, but it could be fun to experiment with some other power ups too." Claude wrote this and built a first version in the game the same day (`#survive`, see the end). Everything here is a proposal for the user to react to. The open questions are at the bottom.

It builds on `2026-11-03-encounters.md` (each enemy asks a spell question; the lull / wave / breather rhythm) and the Arena's wave director in `game/packages/sim/src/waves.ts`.

## What a run feels like, for two players

You start in the middle of a ruined plaza with full pools. Behind two of the four gates, portals swirl open, and the strip at the top reads **WAVE 1 IN 10S: PREPARE**, with the mix underneath (Goblin ×6). It's the Arena's lull, so it's the moment for the prepared play: one of you drops a fire glyph in the west gate's mouth, the other raises a stone arc across the north one.

The wave spills out of the portals in a trickle. The gates are chokepoints, so the first goblins come single file through a gap two wizards wide, straight onto the glyph. The ones from the north find the gap walled and either break through the rock or file round the end of the funnel wall. That detour is the time you bought. You fight. If one of you goes down, the other holds on alone until the wave ends; then comes the **breather**, three seconds in which the fallen get back up at half health.

Then the plaza changes. **Three stone altars rise** in its centre, each with a glowing glyph floating over it and its name above: DEEP FIRE, PYRE, MIRROR CHARM. At the same moment the next wave's portals open behind their gates, with the mix in the strip (Brute ×1, Goblin ×8). So the pick is a real question: what answers *that*? You walk onto PYRE. Your partner, who has been the healer all run, walks onto BLOOM. Standing in an altar's ring fills it in your robe's colour for three quarters of a second, and then it's yours: a pip of your colour lands on the plinth, and the badge appears by your name in the top-left corner. When everyone has picked, the altars sink, the lull counts down (6 s), and the next wave comes.

The rhythm is **wave → breather (3 s) → pick (as long as it takes, at most 30 s) → lull (6 s) → wave**, and the waves keep getting harder. When everyone is down at once, the run is over. A card shows **THE ARENA FELL**, the number of waves survived, and every power-up each player took. Space starts a new run.

What the co-op partner sees during the pick is the important part. The altars sit in one shared place, so you see where your friend is walking, and the strip tells you who is still choosing ("WAITING FOR P2"). Talking about the pick ("you take Bedrock, you're the wall guy") happens on its own.

## How you choose: walk onto an altar

Options considered:

| | How | Co-op read | Cost |
|---|---|---|---|
| **A. Altars in the world, one per player** (chosen) | Three altars rise. Each player stands on one for 0.75 s. Two players may take the same one. | Strong: you see your partner walk to an altar; their colour lands on it. | No new keys. A pick takes a few seconds of walking. |
| B. One shared pick | The team stands on one altar together, or votes. | Strong, and forces a conversation. | One player's build is the team's. Support players lose a personal choice. Deadlock while waiting for a vote. |
| C. A menu | A card overlay with 1 / 2 / 3. | Weak: a menu on each screen, invisible to the other player. | New keys, pauses the world, and breaks the "everything is in the arena" feel. |

**A wins.** It needs no new input (walking is already LMB, or the stick), and it reads in co-op because the choice happens in the shared space. It also keeps pillar 1's spirit: you lean into *your* playstyle, while your partner leans into theirs. Standing still for 0.75 s means walking across an altar on the way to another doesn't take it. The pick has no countdown until 30 s, so it's never rushed (pillar 4). The cap exists only so a player who walked away from the keyboard, or who dropped from an online match, doesn't stall the run.

Each pick offers three *different* power-ups, drawn from the world's RNG and skipping any the whole team already has at the cap. Because they're shared altars, two players taking the same power-up is allowed. That's how a team doubles down.

## The arena

`SURVIVE_ROCK` in `world.ts`: 18 rock segments of old, mossy grey stone (drawn as a new `ruin` wall material, so it never reads as a wizard's raised earth). It never times out and never breaks, and the flow fields steer round it like any rock wall.

```
   +--------------------------------------------------+
   |  L                ## N ##                  L     |
   |  L__                                     __L     |
   |    |                                         |   |
   |  #                                          #    |
   W    ]     |      altar   altar      |     [    E    W/E/N/S: the portals, behind the gates
   |  #                altar                     #    |   ## / #: the gate funnels (2.8 u gaps)
   |    |__                                   __|     |   L: cover on the diagonals
   |  L                ## S ##                  L     |   | : pillars flanking the plaza
   +--------------------------------------------------+
```

- **Four gates, each a funnel.** Two walls in front of every portal leave a 2.8 u gap: a chokepoint. Glyphs, rune motes, a Tidal or Fault-line wave and a spray all shine there. Wall the gap shut and enemies either break through (they attack rock that cuts them off) or file round the funnel's end, which is slower. **This is what rewards walls and positioning**: one wall at the right gate buys seconds. Portals open at the gates farthest from the wizards, one archetype per gate, so where you stand during the pick decides where the next wave comes from.
- **L-shaped cover on the four diagonals.** It blocks archer bolts, gives you corners to fight round (the shieldbearer's slow turn), and gives ice shards something to bounce off.
- **Two pillars flank the central plaza**, breaking the straight line from the east and west gates to the altars.
- **The plaza in the middle** is open: the altars rise there, and it's where you stand to see every gate.

It follows pillar 6: chokepoints, walls and portals are the recurring vocabulary from the encounters doc, not a level-only gimmick.

## The wave curve

`survivePlan(n, players)` in `survive.ts`. Eight authored waves introduce one question at a time, then mix them:

| Wave | Mix | The question |
|---|---|---|
| 1 | Goblin ×5 | Hit many at once |
| 2 | Goblin ×5, Fire imp ×2 | Read the battlefield (imps shrug off fire) |
| 3 | Shieldbearer, Goblin ×6 | Go round |
| 4 | Archer ×2, Shieldbearer, Goblin ×4 | Reach past the front |
| 5 | Brute, Goblin ×6 | Sustain, and protect its target |
| 6 | Grabber, Fire imp ×3, Archer | Rescue |
| 7 | Brute, Shieldbearer ×2, Archer ×2 | All of the above, slower |
| 8 | Brute ×2, Grabber, Goblin ×6, Fire imp ×2 | Everything at once, four gates |

Past wave 8, the eight loop, with 35% more enemies each loop. From wave 4 on, every wave also adds 7% enemy health and 4% damage (speed creeps up 1.5% a wave, for twelve waves). Counts scale with the team: a quarter more per extra wizard. This is placeholder balance, like everything in `config.ts`. The numbers are there to be tuned in the panel, not defended.

## Power-ups

The user's easy ones come first, then ones that bend a rule of the spell system. Each has a cost. **Built** means it's in the sim with a test.

| # | Power-up | What it does | Cost / trade-off | Pillar notes | |
|---|---|---|---|---|---|
| 1 | **Deep pools** | +1 max rune of every element (stacks ×3) | Pure power. Its only cost is the other two altars. Bigger pools also mean bigger spells (a rune more in a spray). | Pillar 1's accepted exception: deeper pools open magic you couldn't reach. | Built |
| 2 | **Deep (element)** | +2 max runes of one element, named on the altar (Deep Fire). Stacks ×4 | Narrows you toward an element, so it leans into a playstyle. A 5-Earth boulder becomes affordable. | As above, and the leaning kind pillar 1 prefers. | Built |
| 3 | **Wellspring** | Runes regenerate 30% faster (stacks ×3) | Pure pace. It shortens "room to think", because you cast more and choose less. | **Mild conflict with pillar 1** ("prefer ... over flat +X% numbers"). It's the one the user asked for by name, so it stays, but watch whether it flattens choices. | Built |
| 4 | **Spare sigil** | +1 Sigil rune: one more turret, glyph or aura standing (×2) | More to babysit. Each turret still draws from your pools. | "Do more things at once": exactly pillar 1's preferred kind. | Built |
| 5 | **Bedrock** | Your rock walls stand twice as long, with 50% more hit points | Only matters if you build. Longer walls also block your partner's shots and your own beams for longer. | Pillar 7: rewards preparing. | Built |
| 6 | **Pyre** | Enemies you set burning explode when they die (2 Fire runes' worth, 1.8 u). Chains | **The burst hits your partner too.** Friendly fire stays (pillar 3); a goblin burning at your friend's feet is now a bomb. Imps don't burn, so it's useless against them. | Pillar 2: a new interaction from existing parts (burning + death). | Built |
| 7 | **Slipstream** | The first spell within 2 s of a Retreat hop costs no runes | Rewards a rhythm (hop, then cast) instead of raw power. It's useless if you never hop. Big spells benefit most, so it pushes you to dodge before a 5-rune cast. | Mastery in the hands (pillar 1), but it adds a timing habit. Watch that it doesn't feel mandatory. | Built |
| 8 | **Mirror charm** | A mirror ward grows on you, and regrows 12 s after you last wore a ward. It drains no Shield pool | Free defence, but only against shots (mirrors reflect missiles). It does nothing against a brute. Casting a real ward replaces it. | Passive power. Fine for a run mode; too strong as permanent progression. | Built |
| 9 | **Bloom** | Your heals splash half onto allies within 2.5 u of the one healed | Makes the support role stronger and pulls the team together, which is exactly where a brute's slam or your own Pyre hurts most. | **Touches pillar 3** ("hitting a friend never helps them by accident"). It only ever heals, and only from heals you chose to cast, so the help is set up on purpose by picking it. Still, flag it. | Built |
| 10 | **Clockwork** | Your turrets' shots cost no runes | Turrets become "set and forget". Your Sigil runes are still bound, and the turret still fires uncharged tap casts. | Strongly rewards preparing (pillar 7). Could make turret builds a no-brainer: watch it. | Built |
| 11 | **Echo** | A free Double stands with you for the next wave | The Double is a magnet (enemies want it more), so you must play round it. | "The Double for a wave", from the user's list. It appears when you pick it, binds no Sigil rune, and fades when the next wave is cleared. It can be picked again. | Built |
| 12 | **Rally** | Stand next to a downed ally for 3 s to bring them back mid-wave (with 40% health) | You stop casting to do it; a grabber or brute punishes the rescuer. Casting, a weapon move, blocking, a hit, a grab or stepping away empties the ring. | Pillar 3's dance, and it answers the death-and-revival idea. | Built |
| 13 | **Glass heart** | +25% damage dealt, −25% max health | A real trade-off build. It conflicts with Bloom-style support play. | Flat +X%, so it **conflicts with pillar 1** as written. It's here because a run mode is where such trades are fun. The user decides. | Designed |
| 14 | **Long fuse** | Your delayed blasts and glyphs are 50% bigger, and arm 50% slower | Prep-heavy, bad in a panic. | Pillar 7. | Designed |
| 15 | **Quickstep** | Recovery after a cast is 40% shorter | Pure pace, like Wellspring. | Pillar 4: it eats "slower, more deliberate". Probably reject. | Designed |

Ideas considered and dropped: **+1 queue length** (the queue is the grammar, and five is its ceiling; a sixth slot would break the spell tree's readability), **heal on kill** (it rewards the damage player only and makes support redundant), and **random element every wave** (the run would be a level gimmick, against pillar 6).

### Where the pillars push back
- **Pillar 1 (mastery in the hands)** is the main tension, because a run mode is built on getting stronger. The built set leans on the accepted exception (deeper pools) and on "do more at once" (Spare sigil, Clockwork). Wellspring and Glass heart are the flat-number ones. Wellspring is in because the user asked for regen. Survive resets every run, so none of this is permanent progression; it's a run-scoped build, closer to Magicka's Magicks than to levelling.
- **Pillar 3 (friendly fire)**: Pyre keeps it (the burst hurts allies). Bloom is the one that helps an ally you didn't aim at; it's flagged above.
- **Pillar 6 (no level gimmicks)**: the altars are a Survive-mode device, not a level mechanic. The arena's vocabulary (gates, cover, portals) is the recurring one.

## What was built (game/, 2026-11-05)

- **Room `survive`**: `#survive` or `?room=survive` in the client, the 3 key (1 Sanctum, 2 Arena), and the lobby's room field carries it, so online co-op plays it too. It's the same lockstep sim. A page in another room turns its world into a survive world when it joins, and a rejoin works too (checked with the BroadcastChannel e2e run in the survive room).
- **Sim** (`survive.ts`, state in `world.run`, which only a survive world has): the arena's static rock (owner `TERRAIN`, which never times out or breaks), the loop above, altars from the world's RNG, the pick by standing, the run's end, and the restart on Space. The restart is an input, so every peer restarts on the same tick. It runs in place: the tick and the RNG carry on.
- **Per-seat rune max and regen**: `runeMax(w, seat, el)` and `regenOf(w, seat)` replace the global `RUNES` reads in the sim and the HUD. Outside Survive they return exactly the config values, and the other rooms' state layout is unchanged, so **the golden hash is unchanged** (`485c0373`).
- **Built power-ups**: 1–10 in the table, each with a test (`packages/sim/test/survive.test.ts`). The tests also cover the loop, a pick, two players picking, the run's end and its restart, and determinism (a bot run through a pick hashes the same twice; snapshot and restore mid-run).
- **Client**: the altars (a stone plinth on a rune ring in the power-up's colour, the glyph floating over it, its name above; standing fills the ring in your robe's colour; takers leave a pip). The wave strip gains PICK A POWER-UP, with the rule of the altar you stand by and who is still choosing, and RUN OVER. A badge row per player sits top left. The run-over card lists waves survived and everyone's picks. The tuning panel gains a Survive line: New run, and Give P1 any power-up. The bot (`?autoplay=1&room=survive`) walks to an altar in the pick.

## Addendum (2026-11-05, later): the big arena

The user, on the first build: "Arena looks tiny btw, I expected it to not even fit everything in the screen at once." So Survive got its own, much bigger arena, and a camera that follows.

**Size.** 44 x 30 units, against the Arena's 24 x 16: about 3.4 times the floor. At 1080p (4x, 30 x 18 units of floor in view) you see about a third of it. At 3x you see most of its height and 30 of its 44 units of width. At 2x (a window under about 810 px tall) only the west and east gates are off screen. The play area is per world now (`w.dims`, fixed by the room). The Sanctum and the Arena keep 24 x 16 and their state layout, so the golden hash is unchanged.

**Zones, from the middle out.** All rock is `TERRAIN`: 40 segments, so players keep 120 of the 160 wall slots.
- **The keep**: a walled courtyard (17 x 12 u) round the altar plaza, its corners cut, with a 3.6 u door on each axis. It's the place to hold, with four doors to watch or wall shut. Two pillars inside screen the plaza from the west and east doors.
- **Causeways**: west and east, a 4.4 u wide walled lane, 5 u long, between the gate and the keep's door. It's a long, narrow approach to fight down: a wave spray or a single rock fills it. This stands in for the "narrow bridge". A true bridge would need ground you can't walk on, and the sim has none yet.
- **Six gates**: V-shaped funnels at the far edges (west, east, and two each on the north and south), each with its portal at the back. Enemies leave by a 2.8–3 u mouth, 12–14 u from the keep.
- **The field**: the open ground between the keep and the gates. It has screens in front of the north and south doors and an L of cover in each corner. Its paving is broken up into grass (the keep and the causeways are whole), so the zones read from the floor as well as from the walls.

**Waves for the space.** Counts are scaled by 1.3 (`SURVIVE_CROWD`). Portals pick the gates farthest from the wizards *and* from each other, and they start a second apart, so a wave comes in from its gates in turn over several seconds rather than all at once. The bot holds the keep (in Survive it ignores enemies more than 14 u away), and a two-bot run still clears waves and picks.

**Camera.** When the arena doesn't fit the view, the camera follows. It eases toward the middle of the living wizards (all of them, when everyone is down), keeps the local player in view when the team is too spread out to frame, and stops a couple of units past the arena's edge. When the team spreads further than the view, the scene steps out one integer scale (4x to 3x; never below 2x, and not with `?scale=`). It steps back in only once the team fits with room to spare, so it doesn't flicker. The HUD keeps its size. Panning moves the scene by whole screen pixels, with the part finer than an art pixel as an offset, so the motion is smooth and every art pixel stays square. The Sanctum and the Arena fit, so they're framed exactly as before.

**Off-screen threats.** Marks sit on the edge of the view. A red pixel arrow points to enemies outside it; close enemies share one arrow, which grows for three or more and flashes for five or more. A pulsing violet diamond with an arrow marks each open portal. Both are hidden when the camera isn't following.

**The costs.** Every added thing costs readability, and these are the ones to watch:
- **You can't see everything any more.** That's the point, but archers and imps can now shoot from off screen. The edge marks are the only warning.
- **Zooming out is a jump.** Integer scales allow nothing smoother. One step out means 4x to 3x, a third more ground, and it happens only when the team splits.
- **Online, each player's camera frames the whole team.** If you'd rather follow only yourself online, that's one line to change.
- **Effect canvases cover the whole arena.** They're redrawn and re-uploaded every frame: about 768 x 390 art px in Survive, against 448 x 256 elsewhere.

### Questions for the user (the big arena)
7. **Size**: is 44 x 30 big enough? At 2x (smaller windows) nearly all of it still fits on screen. 48 x 34 would push it off screen at every scale.
8. **Zoom out when the team splits**: helpful, or would you rather the camera always stay at one scale and just show the edge marks?
9. **The keep's walls**: a held courtyard with four doors, or too static? Its corners could open into four more gaps.

## Addendum (2026-11-05, later): Rally and Echo are built

The user answered question 5 by approving both, Rally first. The details are in `decisions/README.md` (2026-11-05: Survive gets Rally and Echo). In brief:
- **Rally**: stand within 1.6 u of a downed ally for 3 s, hands free, and they get up with 40% health.
  - A partner sees a dashed green ring round the fallen ally (where to stand). While a rally runs, a ring fills in the rescuer's colour, with RALLY overhead and "P1 RALLYING P2 66%" in the wave strip. The revive is a column of Life light.
  - Any break empties the ring: a cast, a weapon move, a block, a hit, a grab, a stun, or stepping away. Queueing runes doesn't break it.
- **Echo**: a free Double appears when you pick it, binds no Sigil rune, and fades when the next wave is cleared. It's the cast Double otherwise: it repeats your spells at half power for half their runes, and enemies want it more.
- Numbers: `PERKS` in `config.ts`, on the tuning panel. `?room=survive&scene=rally` (headless) stages a rally for screenshots.

### Questions for the user (Rally and Echo)
10. **Rally's numbers**: 3 s, 1.6 u, back with 40% health, and any break empties the ring. Should a break only drain part of the ring instead?
11. **Echo's repeats** still cost half the spell's runes, like the cast Double. Should Echo's Double repeat for free?
12. **Echo as a one-shot**: it can be picked again each pick. Or should one pick give a Double every wave for the rest of the run?

## Questions for the user
1. **The pick**: in-world altars, one each and shareable, is Claude's pick. Or would you rather the team choose one together?
2. **Pick timing**: the next wave's portals open *during* the pick, so you can pick for what's coming. Good, or too much to read at once?
3. **Wellspring and Glass heart** are flat numbers. Keep them in a run mode, or hold Survive to pillar 1 as strictly as the campaign?
4. **Bloom**: does healing allies near your heal's target cross pillar 3's "never helps by accident", or is picking it enough intent?
5. **Next to build**: Rally (revive mid-wave) and Echo (a Double for a wave) look like the most co-op of the unbuilt ones. Which first? *(Answered: both, Rally first. Built; see the addendum above.)*
6. **Difficulty**: is the curve the right shape? Authored waves to 8, then loop harder. Or should waves past 8 draw from a pool (the encounters doc's question 3)?
