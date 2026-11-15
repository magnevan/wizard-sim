# Overnight sound pass: five elements, music and ambience (2026-11-14)

The user, going to bed: Healing ("the chimes are awful"), Shield, Frost, Arcane and Sigil "seem like they have pretty bad placeholder sounds", Lightning "could use a polish pass", and "start getting into more environmental sounds and music". Prepare a sizable chunk to review in the morning, mindful of earlier sound feedback, what the spells do, and the references (an audio embedding model allowed).

## What the user signed off before sleeping

- **Credits:** up to about 2,500 ElevenLabs credits on prompts they hadn't seen (a one-night exception to sign-off-before-credits). Spent: 60 clips, about 1,350 credits (the plan is at 5,479 of 10,000). The daily cap of 60 calls (counted per UTC day) was the real limit, so everything else was made from those 60.
- **Music:** free CC0 libraries first. No credits.
- **Environment first:** the battery (outdoors) and the academy and Sanctum (interiors).
- **CLAP** (laion/clap-htsat-unfused, run locally on the CPU) as a helper, reversing "no listening models for now". The user still judges in the Lab.

## How the prompts were written

Each element's spells were listed from the sim (`compile` for every element and cast) with the kit part each one plays, so no clip is made for a part nobody hears (the Fire wall lesson). The reference (Magicka's, the dev baseline) was measured first: its magic sits low (the Life and Arcane beams are mostly under 150 Hz, Shield a 400–500 Hz hum over a sub, Cold's spray an airy 170–440 Hz rush with 3–7 kHz crystal hits). Only Life's self-heal is bright. CLAP heard the references as mostly "a deep bass boom" plus zaps and hums.

The prompts say what's on screen, positively, and three takes each: takes 1 and 2 share a wording, take 3 is a second wording. All are in `tools/sfx/elements-1.json`. The parts:

| Element | Made (3 takes each) | Made locally from those |
|---|---|---|
| Life | heal tick, beam loop, ring, spring loop, self-heal | beam catch, spray loop, spring cast, palm |
| Shield | barrier rising, ward, a blow on a barrier, blink | the Ring of barriers (the barrier's takes) |
| Cold | spray loop, ring, freezing fog, frost hit | spray catch, the fog lying on the floor, Chill on yourself |
| Arcane | beam loop, beam catch, nova, the blast's mark | Attune (the catch), the Arcane burst (the nova, cut) |
| Lightning | arc loop, Discharge, sky strike | the arc's catch, the zap on a body |

## What came back (measured, and CLAP's labels)

- **Life:** the heal ticks (1 and 2) are soft breaths; tick 3 was a steady tone with a boom (CLAP: "a deep bass boom"), wrong for something heard all the time, so take 3 is the self-heal's swell cut short instead. Beam 1 and 2 are one soft steady tone (a risk: the user called code-made tones "little tones"); beam 3 is airier. Spring 3 is almost silent (CLAP: "silence"), raised by the levelling. Ring and self-heal takes read as "a warm magical glow".
- **Shield:** the blocks are low thuds with a ringing tail, cut to 0.45 s and soft (a sound heard often must be gentle). The blinks are clean swooshes.
- **Cold:** sprays 1 and 2 are mostly hiss above 3 kHz (CLAP heard spray 1 as "music"); spray 3 is a mid-range blizzard whoosh. The rings shatter ("glass breaking"). The fogs are low rushes.
- **Arcane:** beams 1 and 2 are the steadiest loops of the night (1–2 dB swing), "a force field humming". The catches are sub-bass thumps.
- **Lightning:** arc 1 drops out at 1.5 s and arc 3 is near silent for 2.4 s; both loops are cut from their steady parts. The strikes are thunder cracks with a boom.

Every take is levelled to the reference's layer for the same part, so the Lab compares sounds, not levels.

## What changed in the game (dev server only, until takes are chosen)

- **Heal ticks** played Life's chime on every heal: the chime the user hated. They now play Life's kit's new `tick` part where it has one.
- **The healing spring, a blow turned aside by a barrier, the Blink and the freezing fog** play their element's kit (`ground`, `land`, `force`, `ground`). The fog was silent. The Blink's cast is silent, so the Blink isn't heard twice.
- **The Lab:** five new labs (`?lab=life`, `shield`, `cold`, `arcane`, `lightning`), each part with three takes beside the reference. It keeps bodies hurt for heals (`Moment.hurt`), plays a part it can't stage on a button (`Section.direct`, the blocked blow), and lets heal ticks, zones and the Blink through.
- **Sigil:** glyphs arming had the same click for all but Cold. Life, Lightning, Arcane and Fire now have a small sound of their element (one take each, the click beside it), in `?lab=sigil`.
- The game plays only the reference for a part under review until a take is chosen, as with Fire.

## Music and ambience

27 CC0 candidates from OpenGameArt, loudness-matched (music about −22 LUFS, ambience about −30) and kept in the gitignored `.reference/audio/library/` (`.reference/tools/atmos.py` makes them, `oga.py` fetched them and checked each licence). Ambience is folded into seamless loops; four beds are mixed or tinted here (forest + wind, birds and wind at dusk, a stone hall with a far hearth, a warmer stone hall).

- **The battery:** forest, birds and wind, wind, forest + wind, dusk; music: seven fight tracks (RandomMind's Medieval: Battle, cynicmusic's Battle Theme A, an orchestral battle, a war march, an epic boss loop, a lament) and Exploration.
- **The academy and the Sanctum:** stone halls, a hearth, a hall with a far hearth, a warmer hall; music: eight calm tracks (Medieval: Exploration, Town Theme, The Field of Dreams, Rising Moon, Magic Town, Contemplation, The Bard's Tale, The Old Tower Inn).
- Survive, the Arena and the tutorial have a few each.

The engine gained a `bed` player: ambience decoded and looped without a gap on the effects bus, music streamed on the music bus (until now "reserved"), crossfaded. The **Atmosphere Lab** (`?lab=atmos`, then go to a room) lists the room's candidates with Play, a level slider per kind, a mark and a note each (`atmos/<room>/<kind>/<id>` in `lab-notes.json`). Once one is marked Right, the dev game plays it in that room. None of it is in the public game.

## Open questions for the user

1. **Life beam:** a soft steady tone (takes 1 and 2) or the airier take 3? If neither, what should held healing sound like?
2. **Heal ticks:** a soft breath on every tick, or silent (as burn ticks went), with the beam's loop saying it?
3. **The healing spray** has no clips of its own (it borrows the beam's and the spring's). Worth its own?
4. **Music:** RandomMind's set (Exploration and Battle) shares a composer and a sound, so it could be the game's whole palette. Or another direction?
5. **Ambience:** one bed per room, or layers (wind + birds + a far battle) that change with what's happening?

## Next

Pick takes in the Labs; settled parts move into the kit the way Fire's did. Each element then goes to the public game when it's complete (Fire is still waiting for that). Tomorrow's calls (60 a day) can redo whatever's rejected, from the user's own words.

## The next day: the user's review

- **Settled** (the dev game plays them; they left the Lab):
  - **Life:** the beam (take 1, "friendly"), a new catch from the user's own wording (take 3, "a nice soft tap with a slight echo"), the heal tick (take 1, about 10 dB under round 1), self-heal and palm (take 1), the spring's cast (take 1, for now), and the ring (round 3 take 3: round 1's shimmer at 30 % under the catch's tap, "good enough").
  - **Shield:** the barrier (take 2, arc and ring), the ward (take 3), the blink (take 1, "a very good fit for the speed of the spell"), and blocked blows (takes 1 and 2 at random; take 3 is kept for arrows, once the sim says what a block stopped).
  - **Frost:** the spray and its catch (take 2, "even better" than 1), the ring (take 3, "more like a forceful burst"), the hit (take 1), the fog's cast (take 3, "a rapid flow of cold air and crackling").
  - **Arcane:** the beam and its catch (take 2), Attune (take 1).
  - **Lightning, complete:** the arc and its catch (take 1), the zap (take 2), Discharge (take 3), the strike (take 1).
  - **Fire, complete:** the flamethrower confirmed.
- **Still open:** the Healing spring's loop and the Healing spray (every take rejected: rain, waves, mist with a drop), and the freezing fog's lying loop (the spray slowed down had "no cone being blown"; a crackle bed made from the hits was "too dynamic"). Prompts for all three wait for the user's OK. Arcane's nova and blast are in round 2, made locally: the nova from take 3's start, which was "more explosive", and the blast's marks squeezed into its 0.6 s fuse (round 1's were still rising after the explosion).
- **Lab bugs found by the review:**
  - A row of several spells in turn played only the first on Once, so the Arcane burst and the ring's takes "had no sound".
  - The glyph row cast no glyph at all: two Sigil runes cancel (Sigil cancels Sigil), so each was its element's own Place.
  - Both are fixed. The Lab is now one page (`?lab`) with tabs and counts of takes still to review, and each take shows its prompt and how it was made.
- **Music:** "great overall, but we need some battle music as well". Seven fight tracks were in the battery's list, but the tab showed only the room you stood in. Now it lists every track by mood, with Use here to pick one for the room. Ten more CC0 battle tracks are in (now 16 battle and boss tracks). The user marked every interior bed and most calm tracks Right, and said The Old Tower Inn "could be the academy" (now its default).
- **Generation pace:** the daily cap went from 60 to 300 calls (the plan can move from 10k to 121k credits a month), but rounds stay at three takes, keeping credits for refining.
