# The courtyard: the read (stage 0)

The concept art read as a plan: stage 0 of [making a place](../making-a-place.md). The source is `docs/reference/element-order/area-courtyard-start.jpg`, with the academy overview (`docs/reference/wizard-academy-with-training-grounds.png`) and the district map (`docs/reference/academy-harbor-district-concept.png`) for where it sits. Written 2026-11-22.

Directions are screen directions: "down" is towards the camera.

## What the place does

The opening's hub. You cross it four times:
- out to the yard;
- back, then out to the battery;
- back again after the ward bell;
- at the finale, where you lock the armillary's rings against the warband and the rift aurochs.

So it's the hub, a landmark you keep returning to, and a battlefield for the finale.

## The concept, as a plan

| | In the concept | Why it works |
|---|---|---|
| **Footprint** | An octagonal plaza, about 60 wizards across (~55 u), squashed 2:1 by the camera | A round shape faces inward, so it reads as a hub straight away |
| **Height tiers** | The plaza. The armillary's dais, a few steps up. A sea landing far below, reached by a grand stair. The outer road, running lower outside the west wall. The greenhouse's terrace, down a few steps at upper left | You enter from below and climb into the place. The dais makes the centre a stage |
| **Edges** | Arcades and walls between four pavilions at the diagonals. A cliff with a waterfall at lower right. The sea at the bottom | Every edge has a reason, and the open edge (the sea) is the one facing the camera |
| **Routes** | Main axis: the sea stair, the south gate, the dais, the north gate. Cross axis: the west gate (road), the east bridge (over the falls). Seven coloured channels radiate from the dais to compass medallions at the vertices | The channels are paths drawn on the floor: they point at every exit |
| **Landmark** | The armillary, standing high, with a purple beam rising from it. Lamps ring the dais | You can see it from every gate, and the beam can be seen from the walks |
| **Scale ladder** | The armillary; then the pavilions and gatehouses; then lamps, banners, trees and people | Three clear sizes |
| **Beyond the edges** | The training yard behind the upper-right arcade. A tent camp and a smoking village to the left. Lightning towers past the north gate. The river and the falls | It's a crossroads in a larger world |
| **Light** | Warm stone, a cool sea, and violet in the beam and in cracks in the paving | The violet marks the magic, and the eye goes to the centre |

## What our first build missed

| Concept | Our rounds 1 to 7 |
|---|---|
| Octagon, facing inward | A 150 × 110 rectangle |
| Climbs from the sea, and has a dais | One flat height |
| A cliff and a waterfall at the open edge | Water painted on the ground, like a carpet |
| Pavilions at the diagonals, gates on the axes | Buildings along the north edge |
| Channels point at the exits | A rosette inlaid at the centre only |
| It sits in a larger world | A box with woods round it |

## What to keep in every plan

- One landmark, the armillary, high, visible from every entrance, and slightly above where you arrive (principle 17).
- At least three height tiers, including one facing the camera that you can look down from.
- The sea or a drop on the side facing the camera (principles 15 and 16).
- Four ways out: to the yard, to the battery, to the north road (later stops), and to the sea landing (the harbour, later).
- A floor big enough for the finale: a warband, the aurochs charging, and four players.

## The journey

Every pass through the courtyard, in the brief's order. Which exit leads to which stop was approved by the user on 2026-11-22 ("your proposal seems fine"): the infirmary just outside the main gate, on the battery's road; the ward line behind the academy, up the north road; the gorge up the stream past the bridge; the harbour and the cliff road at the sea landing. Drawn on plan D by `court-d.py` (`out/court-d-journey.png`).

| # | Pass | The moment it should give |
|---|---|---|
| 1 | The briefing at the armillary | You start below the dais. The armillary fills the screen, and the beam stutters above the masters |
| 2 | Out to the drill yard | Up the grand stair and west along the balcony. The bell tower marks the turn |
| 3 | Back from the yard, out through the main gate to the infirmary, then the battery | **The reveal.** At the top of the grand stair the armillary is framed between the pylons. The beacon pulls you east |
| 4 | Back from the battery: the ward bell, then north to the ward line | **Homecoming.** Down the grand stair to the bell at the dais, then up through the great hall |
| 5 | Back from the ward line, out to the gorge | The best approach: straight down the north road onto the armillary, then out past the falls |
| 6 | The finale: up from the sea landing | The climb from the sea, framed by the rim's gateway, with the armillary torn open above the warband |

Most through-traffic stays on the balcony arc, and you go down into the plaza on four passes (the briefing, the bell, the way back from the ward line, the finale). So the arc is the hub you cross, and the plaza is a destination.

## Neighbours

| Exit | Leads to | Today's marker |
|---|---|---|
| West | The drill yard (beats 2 and 3) | `gate-yard` |
| East | The battery (beats 4 to 7) | `gate-battery` |
| North | The north road, later stops | none |
| South, down | The sea landing and the harbour | none |

## Stage 1 and 2: the plan, and flow on frames

The structure critic compared plans A to D, and the user chose D on 2026-11-22. Four flow rounds on play-size frames from the plan tool then reshaped it (`tools/place-plans/plans/court-d.py`, revision 5; the scores and lessons are in [the cycle log](../making-a-place.md#the-cycle-log)):

| Round | Score | What changed after it |
|---|---|---|
| 1 | 4/10 | Routes re-cut onto diagonals |
| 2 | 5/10 | Every main arrival brought through the north, down one grand stair |
| 3 | 5/10 | The cross road moved in front of the great hall, as a balcony arc |
| 4 | 5/10 | A marker at each turn of the arc, threshold pillars, the road a step up; then stopped, as the rest is dressing |

**Dressing cues carried into the grey-box**, for the flow check there:
- Lamps or braziers along the arc, about one a screen, brighter towards the grand stair.
- The arc and the spine in the best stone, the terraces plainer, and wear lines towards the plaza.
- The armillary's violet light pooling on the plaza and running out along paving lines to each exit.
- Smoke or a lit window at the battery's tower, and pennants along the bridge.
- A balustrade and a bench over the sea on the lower terrace, and a boat at the landing.
- The hall's side doors set back under porches, so they read as side places.

## Stage 2 in the game, and what's left for stages 3 and 4

The grey-box was walked in the game five times (2026-11-22, `npm run shot:route` along the journey), the layout scoring 4, 5, 6, 7, then 7.5 out of 10:

| Round | Plan D | What it found |
|---|---|---|
| 1 | rev 6 | Too big at play zoom: the arc was 8 screens of the same, and the dais never shared a frame with the balcony |
| 2 | rev 7 | The armillary, then ten wizards tall, rose over the axis stair on screen and hid it |
| 3 | rev 8 | The routes read; the overlook and the finale climb didn't land yet |
| 4 | rev 9 | The overlook read as a crossroads; the hall passage and the gorge path were dead |
| 5 | rev 10 | Ready for the sense stage; the reveal lands in the overlook bay |

**For the sense stage** (rev 11 makes the first three fixes: the flights 4 u further out, the bridge's south tower a 3 m post, a parapet along the balcony's lip open at the flights and the bay):
- The overlook bay and the east flight's head blur together: separate them with a parapet run, or move the flight's head a tread east.
- The bridgehead's tall gate tower stands south of the route at the east end, so it hides the wizard for a moment. Move it north of the path, or thin it.
- The decks at the flights' heads are big and blank: give them an edge and a direction.

**For the camera (engine):** the armillary can't be seen whole with the party in a 1080p frame (about 390 art px against about 170 px of view). The look-ahead helps. **The user (2026-11-22): "keep it large, and only show pieces of it on screen at a time, with maybe some sequences where the whole thing comes into view."** So it stays at about seven wizards tall, and the briefing and the finale get camera sequences that bring the whole armillary into view (asked of the engine session).

**For dressing:**
- a tall marker at the gorge exit;
- doors, banners or a skylight band along the hall passage;
- planters, a balustrade or wear lines at the flights' heads;
- a beacon at the quay;
- parapets and kerbs at every drop;
- different paving per level;
- clean road edges.
