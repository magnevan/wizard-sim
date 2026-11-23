# The drill yard: the read (stage 0)

The concept art read as a plan: stage 0 of [making a place](../making-a-place.md). The source is `docs/reference/opening-yard-walks/w1-yard.jpg`, approved with [the weapons section](../../explorations/2026-11-22-weapons-yard-and-walks.md#1-the-weapons-section) on 2026-11-22. The academy overview (`docs/reference/wizard-academy-with-training-grounds.png`) shows where it sits. Written 2026-11-22. The yard as built (`#yard`) predates the cycle, so its plan isn't reused. Its stations, their order and their rules (`sim/src/yard.ts`) carry over.

Directions are screen directions: "down" is towards the camera.

## What the place does

Beats 2 and 3, the crash course in fighting, about three minutes. It has one worn path past the stations in order:
- **Strike:** straw goblins in lanes.
- **Heavy:** shove the sack into a chalk ring.
- **Retreat:** a hired soldier's mallet slams.
- **Parry:** blunt bolts down a lane.
- **Hands:** four straw goblins rush you.

Then the focus at the armoury's rack: one Fire and one Sigil, for the flame sword. Each station shows what it does before it does anything to you (the user: "We can't just walk over and have someone suddenly shoot arrows at us"). In the open middle, hired soldiers drill with plain-steel spears, a maul, bows and a trident. That's the weapon family you'll recognise later. The yard stays open: you pass it again and can try each new weapon there. The user wanted it "a bit larger" than the 90 × 68 built first.

## The concept, as a plan

| | In the concept | Why it works, or doesn't |
|---|---|---|
| **Footprint** | A long yard along the foot of a tall range, with an open drill ground in front, a low wall and woods at the bottom | The range as the far side is right: it rises off the top of the screen without hiding play (buildings stand on the far sides) |
| **Height** | Flat, except a few steps up to the arcade | Flat, so it's the trap again |
| **Routes** | One worn path from the left along the stations, past the armoury door, to a gate arch on the right | One path past the stations in order: the lesson is the route |
| **Stations** | Bays in the range's arcade: posts, the mallet ring, the parry lane, the hands ring | Each station is its own bay, so you see it before you enter it |
| **Landmark** | The gate arch and the armoury's glowing rack | The rack (the flame sword) is the goal |
| **Beyond** | The academy's ranges, woods past the wall | |

## What to keep in every plan

- The stations in order on one path, each in its own bay or ring that you see before you enter.
- The soldiers' drill ground in the open, seen from the path the whole way.
- The rack and the armoury door at the end: the flame sword as the payoff.
- At least two levels: the path could look down on the drill ground, for example.
- The seam: you arrive from the courtyard's balcony road at its west end, at the 6 m plateau, sideways on. Turn onto a stretch running down the screen within a screen of arriving (principle 18).
- About three screens by three, so it's bigger than before but every station stays within a screen of the next.

## The journey

| # | Pass | The moment it should give |
|---|---|---|
| 1 | In from the courtyard's west gate | The yard spread out: the stations along the range, the soldiers drilling, the armoury's glow at the far end |
| 2 | The stations in order: strike, heavy, retreat, parry, hands | Each one seen, then entered |
| 3 | The rack at the armoury door | The focus, the flame sword: Conjure |
| 4 | Back out to the courtyard | The way home in view, and the bell tower marks the gate |
| 5 | Later, passing by | The straw goblins standing again, to try each new weapon on |

## Stage 1: the plans, and the pick

The structure critic ranked C, the ring, at 6.5/10; A, the gallery, at 6; and B, the descent, at 5.5. The yard as built, shown blind, scored 3.5. Plan D, the horseshoe (`tools/place-plans/plans/yard-d.py`), is the critic's mix, and the user chose it on 2026-11-22 ("D seems fine"). It has a pit sunk 3 m where the soldiers drill, open along the north to the ranges' foot. A rim runs round the east, south and west. The stations run down the screen from the arrival: strike, heavy and retreat as bays over the pit, the parry lane as a flight down into it, the hands ring on the pit floor, then the armoury at the west end. Its `MARKERS` give the sim's station spots (`sim/src/yard.ts`).

## Stage 2 on flat frames (2026-11-22)

| Round | Plan D | Score | What changed after it |
|---|---|---|---|
| 1 | rev 1 | 6/10 | The way back sat beside the arrival, inviting a skip, so the gate moved and the way back now climbs at the rim's north-east tip. The pit was oversized, so it's smaller. The bays read as flat stains, so they're now a tread up over the pit |
| 2 | rev 2 | 7/10 | "Ready for the in-game grey-box" |

**For the game:** block the north-east flight (a soldier or a rope) until the hands ring is done, so seeing it from the arrival is harmless. **For dressing:** treads on the parry lane, the soldiers set out along the crossing pointing at the way back, and the blank rim behind the bays.

## Stage 2 in the game (2026-11-22)

| Round | Plan D | Score | What changed after it |
|---|---|---|---|
| 1 | rev 2 | 6/10 | The way back was more than a screen from the rack, so it now goes up the parry lane's own flight (rev 3). The pit's depth reads flat from its south rim (principle 23); that's for dressing |
| 2 | rev 3 | 7/10 | "Leads at every step. Ready for the sense stage" |

**For dressing:** treads and stepping side walls on the parry lane so it reads as a descent; a body for the rack; a lip on the rim's inner edge and a darker pit floor; the scenery soldiers along the crossing. The way back retraces the bays (about 5 screens): legible, the weakest stretch, kept.

## Sense in the game (2026-11-22)

| Round | Plan D | Score | What changed after it |
|---|---|---|---|
| 1 | rev 3 | 6/10 | The rim dropped 4 m sheer into low woods, so the yard read as a mound with a bowl on top: the woods are level with the rim now (rev 4) |
| 2 | rev 4 | 7/10 | The woods' own end showed a screen past the rim: they run 18 u further, and the gate's line is closed (rev 5) |
| 3 | rev 5 | 8/10 | **Sense passed**: "ready for the beauty stage" |

**For the beauty stage:** posts or a low wall at the east gate (the path ends in open woods, with nothing for the gate to be a gap in); straight-cut decking and paving edges; the pit's lip and a darker floor; treads on the parry lane; a body for the rack; the props and scenery people the old blockout had.
