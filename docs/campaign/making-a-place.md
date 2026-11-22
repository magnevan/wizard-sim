# Making a place

How one place (a courtyard, a yard, a road) goes from its concept art to a finished level. This sits inside stage 4, Blockout, and stage 6, Dressing, of [making a segment](README.md). Started 2026-11-22. **It's meant to change.** Every change goes in the [cycle log](#the-cycle-log) at the bottom, with what prompted it.

**Why it exists.** Overnight on 2026-11-21, the courtyard went through seven rounds with a beauty critic and rose from 5 to 6 out of 10, then stopped. Every round polished the same flat rectangle, with buildings along the north edge. The user named four failures:
1. The rectangular layout never changed, though the concept is an octagon in a sprawling academy.
2. There's no depth: the concept has cliffs, terraces and stairs, and our water looked like a carpet.
3. Nothing guides the player.
4. Details don't make sense: bushes at doors, doors without paths, no shore, buildings drawn in the wrong order.

The causes:
- The engine can't express height.
- The critic only saw beauty, in one overview picture.
- There was only ever one layout, so every round built on the round before.
- Nobody checked the mistakes a script could catch.

## The stages

A place passes each gate before the next stage starts. A stage can send the place back. Beauty comes last, so polish can't hide a weak plan.

| # | Stage | What gets made | Critic and gate | Lives in |
|---|---|---|---|---|
| 0 | **Read** | The concept read as a plan: footprint, height tiers, edges, routes, landmarks, sightlines, how it joins its neighbours. Also **the journey**: every pass the player makes through the place, in order, with its direction, its purpose and the moment it should give (a reveal, a homecoming, the finale) | Claude, checked against [the principles](level-design.md) | `NN-name/<place>-read.md` |
| 1 | **Structure** | **Three plans that really differ**, as plan specs, drawn from above and in the game's camera, extruded by height. Each passes the walk report (`tools/place-plans/to_ldtk.py <plan> --report`) before a critic sees it | Structure critic, then the user picks one (or a mix) | `tools/place-plans/` and the segment page |
| 2 | **Flow** | First, play-size frames along each route from the plan tool (`--frames`), with no labels. Then a walkable grey-box of the chosen plan, with heights, stairs, cliffs and water | Flow critic on the frames, first blind ("where would you walk?"), then with the plan; on the grey-box, the [sense lint](#the-sense-rules) passes too | `tools/place-plans/out/`, then the LDtk level |
| 3 | **Sense** | The grey-box dressed with props in grey or rough art | Sense critic and the lint | Same level |
| 4 | **Beauty** | Codex art: buildings, props, ground, lighting. A blockout's boxes face the camera squarely because they're drawn on the grid; the art needn't, and buildings and props can turn 45° as in the concepts (the user, 2026-11-22) | Beauty critic, the loop we already had | Same level |

**Divergence rule (stage 1).** The three plans can't share a footprint shape, and at least one has to make the user say "huh". Plans come from the read and the principles, never from an earlier blockout. When a later stage sends a place back to stage 1, it gets three new plans, not a patch.

**One source.** A plan spec is a small data file. It sets out the outline, the height tiers, the cliffs, ramps and stairs, the water, the building footprints with their doors, the routes and the landmarks. The diagram, the camera preview and later the grey-box level are all made from it, so a plan never has to be redrawn by hand.

**Concept art from the blockout, for the user only (2026-11-22).** When a blockout goes to the user, an isolated agent also paints it as concept art with Codex, in the style of the place's concept, and adds the pictures to the review page (`renders.js` beside the segment page). The critics never see these, and neither does the designer: the user asked for this so the art doesn't steer the early stages, while still giving the user something to react to beside the grey boxes. The agent reports only which files it made.

## The critics

Each critic is a fresh agent. It gets only what its stage needs, and its brief below. Critics score from 1 to 10, and they name the **one structural change** that would help most before listing smaller fixes. A critic that could only suggest small fixes would keep us in a local maximum.

**Structure critic.** Gets the three plans (from above and in the game's camera), the concept art and the principles. Asks:
- Which plan is most interesting to stand in, and why?
- Is it varied in height: tiers, edges, places to look down from?
- Does its silhouette say what the place is?
- Does it sprawl, with places beyond it, or is it a box?
- Where's the grandeur, and does the camera see it?

It doesn't judge fidelity to the concept. The concept is a source of ideas, not a spec.

**Flow critic.** Gets frames at play zoom along each pass of the journey (`npm run shot:route`), plus the plan. It sorts what's wrong into layout, camera and dressing, and scores the layout alone. It's asked to play first-time player: "Where would you walk from here, and why?" A wrong answer means the place doesn't lead. Then:
- Does a landmark pull you on?
- Are the main routes wider and brighter than the side routes?
- Is there a dead end with no reward?
- Is there a place to stop and look?

**Sense critic.** Gets frames close up on every door, edge and joint between materials, and a list of the lint's results. It asks whether a real builder would have made this, then goes through [the sense rules](#the-sense-rules).

**Beauty critic.** The loop we already had (memory: beauty-critic-loop). Gets frames in the game's camera and the concept art, and judges beauty and interest compared with the concept, not how closely the layout matches it.

## The sense rules

Mistakes a script can catch go in `content:check`. A rule goes there as soon as it can be checked automatically, and the rest stay with the sense critic.

| Rule | Check |
|---|---|
| A door has 3 u clear in front of it, and a path material leads to it | lint, warning (`game/packages/content/src/sense.mjs`) |
| Every gate and marker is reachable from the start along walkable ground | `content:check`, error, for starts, portals and `gate-*` markers; `to_ldtk.py --report` for every marker of a plan |
| Water always meets a shore, a quay or a cliff, never grass or paving directly | lint, warning |
| Two ground materials meet with a transition: an edge tile, a kerb, or a scatter blend | critic, then lint |
| Nothing taller than knee height blocks a door, a gate, stairs or a sightline marked in the plan | lint, warning, for doors and gates (their 3 u approach); stair heads and sightlines: critic |
| A building is drawn in front of what stands behind it and behind what stands in front (sorted by footprint) | engine |
| Stairs and ramps join two tiers at both ends; a cliff edge has a lip or a wall | `content:check`, error, for painted stairs; `to_ldtk.py --report` for a plan's flights; lips: critic |
| Plants grow on soil, not on paving, unless they're in a planter | critic |

## Improving the cycle

The cycle improves itself in three ways:
- **Whatever the user catches becomes a rule.** When the user spots something the critics missed, we ask which stage should have caught it. The fix goes to that stage: a line in a critic's brief, a principle, a sense rule, or a tool. Then it goes in the log.
- **A look back after each place.** When a place passes stage 4, we add a log row on what took the most rounds, which critic was too kind or too harsh, and what to change.
- **Critic calibration.** Before a critic's brief is trusted, it's run on the concept art itself, which should score 8 or more, and on a known-bad screenshot from before 2026-11-22, which should score 4 or less. If it doesn't, the brief changes.

Every few places, the user reads the log and cuts any stage or rule that isn't paying for itself.

## The cycle log

| Date | What happened | Which stage should have caught it | Change |
|---|---|---|---|
| 2026-11-22 | 7 beauty rounds on the courtyard plateaued at 6/10; the user named four failures: a rectangular layout, no depth, no flow, details that don't make sense | None existed except beauty | This cycle: the read, three divergent plans, flow and sense critics, the sense lint, and the height work in the engine |
| 2026-11-22 | Beauty round 1 on the courtyard: 2/10, from a stale build (I rebuilt the content, not the game, so no props showed), with dark diamonds over every terrace (each rock cell edge cast a flat shadow at ground height), white tile-like slabs and the old grey boxes still standing over the new level | Beauty (critic) | Before any in-game shoot: `npm run content:build` **and** `npm run build`. Rooms with height tiers cast no flat rock shadows; warm flagstone paving; the old massing gone |
| 2026-11-22 | Sense in the game on the yard (6, then 7/10) and the infirmary (7, then 8/10): each time the world's edge showed a screen out (the yard's low woods, then its woods' end; the infirmary's sea), and the lint's void check, which only counts void cells inside the room, missed it. Gates had a leak too: a road wider than a gate's 3 u reach let you walk round the gate | Sense (critic), not the lint | The walk report counts walkable ground within sight of the box's edge (12 u, at the bottom 10 u plus 1.8 u a metre); `finish.close_gates` closes each gate's line; woods outside the gates. Yard rev 5, infirmary rev 9 |
| 2026-11-22 | Third in-game round: the infirmary's flow 8/10 (passed; the overlook's two flights still alike), the courtyard's sense 8/10 (passed: the ledge made the sea one level) | Flow and sense in the game | Infirmary rev 7: the east overlook flight a long run along the drop. The courtyard's grey-box is done and goes to the beauty stage |
| 2026-11-22 | Second in-game round: the yard 7/10, ready for sense; the infirmary 7/10 (its lower loop's two flights were the same picture); the courtyard's sense 7.5/10 (the sea looked stepped: cliff faces dropping into water are drawn in the water's colour) | Flow and sense in the game | Yard passes flow. Infirmary rev 6: the shore flight back up runs along the cliff, and the road starts at the well. Court rev 17: a stone ledge at the cliff's foot, so no face stands in the sea |
| 2026-11-22 | In-game rounds on the plan-made levels (branch `opening-levels`): the yard 6/10 (the pit's 3 m read flat from its south rim; the way back was more than a screen from the rack), the infirmary 6.5/10 (a 3 m drop below the overlook hid the well), the courtyard's sense 7.5/10 (only the battery road's gate piers left) | Flow and sense in the game | Principle 23: height reads only on faces turned toward the camera. Yard rev 3 makes the way back the parry lane's flight. Infirmary rev 5 lowers the drop below the overlook to 1.5 m. Court rev 16 squares the piers |
| 2026-11-22 | The third sense round (rev 14): 7/10. The fixes held: one sea level, buildings at real scale, stoops, a quay on posts. Left: no parapets on public edges away from the routes (the flights' open sides, a terrace corner, the battery road over the falls) | Sense, and the lint's reach: route-side only | Rev 15 gives every public edge over a metre a parapet (`finish.lips(P, everywhere=True)`), and adds a weir at the falls. Dressing for the art stage: paving in straight courses, door frames, windows and roofs, and copings, foam and bollards at the shore |
| 2026-11-22 | The second sense round (rev 13, the new lint clean): 6.5/10, "clearly up". Left: two sea levels at the pier, buildings too low to read as buildings, hall doors with no threshold, the battery road's gate piers unpaired | Sense | Rev 14: the sea a metre under the quay, the hall 16 m and the wings 9 m (the most principle 20 allows south of the balcony road), stoops at the hall's doors, paired gate piers. The rest is dressing: paving in kerbed fields, copings on every edge, door frames |
| 2026-11-22 | The sense stage on the courtyard (rev 11): the lint found nothing; the sense critic, on 38 close-ups (doors, flight ends, the shore), gave 5.5/10. Doors squeezed against the road or in corners, road edges dropping a tier with no lip, void at the map's edges, a river starting from nothing, curved walls drawn as a sawtooth, roofs in floor paving | Sense | Rev 12 fixes the plan's share (forecourts, lips, the yard's gate piers, sea past the edges, a culvert, woods on land no route reaches). The sawtooth walls, the roof material and five new lint rules went to the engine thread. `journey_spots.py --sense` makes the close-up spots |
| 2026-11-22 | The user, on the walks' first space diagram: "very low resolution", "not totally clear what path you are taking". And: "It would be cool to also have some concept art that matches the blocking... We probably should not show this to the critic, and I'm not even sure you should look at it yourself" | Presenting to the user | Diagrams for the user are drawn large, with the path in walking order and the events marked, and every picture on the review page zooms on click. Concept art painted from each blockout comes from an isolated agent, for the user only |
| 2026-11-22 | Structure critic on the infirmary (the second place through the cycle): plans B 7, C 6, A 5, the control (the concept taken literally) 3. All three plans were about 3 × 3 screens against a 2 × 2 target, and the critic caught it from the plans' one-screen box | Structure | A place's size target goes in its read, and plans are checked against it before a critic. Plan D (B with C's raised conduits) was compressed to 4,340 u² of walkable ground (A and B were about 7,400) |
| 2026-11-22 | The fifth in-game flow round, plan D rev 10 with the engine's landmark look-ahead: 7.5/10 for the layout, "ready for the sense stage". Every pass reads and the overlook reveal lands. What's left is local: the bay and the east flight's head blur together, a bridgehead tower briefly stands south of the route, and the decks at the flight heads are blank | Flow passed | The courtyard leaves the flow stage. Its leftovers and the dressing cues are listed in the courtyard's read for the sense and dressing stages. In-game flow went 4, 5, 6, 7, 7.5 over five revisions, each round shot in two batches (`npm run shot:route`) |
| 2026-11-22 | The fourth in-game flow round, plan D rev 9: 7/10 for the layout alone. Asked to sort what's left into layout, camera and dressing, the critic named three layout items (the overlook read as the north road's crossroads; the hall passage was three screens of corridor; the gorge exit was dead), one camera item (a tall landmark leaves the top of the frame when you walk up the screen towards it), and dressing (edges, paving per level) | Flow, and the brief: sorting causes keeps the critic from asking layout to fix camera or dressing problems | The flow brief now asks for that three-way split and scores the layout alone. Rev 10 makes the overlook its own bay, two treads down and east of the axis, and shortens the hall passage and the gorge path. The camera look-ahead went to the height thread |
| 2026-11-22 | The third in-game flow round, plan D rev 8: 6/10. The routes, the flights and the roads read, and the armillary orients you without hiding anything. The two set pieces don't land yet: the overlook doesn't show its drop, and the finale climb is two screens of the same stair ending under the dais. The road ends are padding | Flow | Rev 9 is structural: a shorter finale climb broken by a landing; the overlook as a bay over the drop with low posts; a two-tread rim; the battery a screen nearer; gate towers on the north road |
| 2026-11-22 | The second in-game flow round, plan D rev 7 with the armillary placed: 5/10. The arc, the bridge and the exits worked, but the armillary (about a screen tall, ten wizards) rose over the grand stair on screen and hid the stair and the player, and from below its top ran off the screen | Flow, and the read: size the landmark for the camera | Principle 22: keep routes out of a landmark's screen shadow. Rev 8 splits the grand stair into flights either side of the dais with an overlook on the axis, and the armillary is cut to about 70% (`props.py --height 420`; footprint 13 u) |
| 2026-11-22 | The first in-game flow round, on the grey-box of plan D rev 6 (`npm run shot:route`): 4/10. At play zoom the plan was too big. The arc walked as 8 near-identical screens, the dais never shared a frame with the balcony, and the reveal couldn't be judged with no armillary in the level. The camera also framed the unlifted ground point, so the wizard sat at the top of the screen on high tiers | Flow, which the flat frames had overrated (5/10) | Principle 21: measure routes in screens. The flow critic always gets the landmark as a volume. Flat frames are a first filter, and the score that counts is in-game. Rev 7 pulls the courtyard together (the arc 43 to 28 u, the stair head about 25 u from the dais). The camera bug and the missing armillary went to the engine thread |
| 2026-11-22 | The engine's plan-to-level report (`to_ldtk.py --report`) on plan D rev 5: the top terrace, the dais and the sea court were cut off, with 128 jumps inside flights. Four critic rounds had judged a plan that couldn't be walked, because the plan views hide jumps inside flights | Structure and flow | **Every plan revision passes the walk report before a critic sees it** (everything marked reachable from the start, no jumps inside flights). Flights get about 3 u of run per metre of drop along a screen vertical, 2 u along a screen diagonal. Rev 6 fixed the grand stair, the dais, the sea stair and the landing |
| 2026-11-22 | The user: "should we maybe also diagram the general path(s) we expect the player to take? To help inform the outcome we're looking for." The routes showed where you can walk, but not the order, the direction or what each pass is for | Read | Stage 0 now writes the journey; the plan tool draws it (`journey()`, `out/<name>-journey.png`), and the flow frames follow its passes in walking direction. The courtyard's journey showed most through-traffic stays on the balcony arc: the plaza is a destination, not a crossing |
| 2026-11-22 | Flow critic, round 4 on plan D rev 4: 5/10 again, the third round in a row without the score moving. The critic: with the seams fixed, only dressing can make the arc's sideways stretches feel led | The cycle itself | **Stopping rule:** when two flow rounds on flat frames don't move the score, and the critic says the rest is dressing, stop. Make its cheap structural fixes (rev 5: markers at the arc's turns, threshold pillars, the road a step up), carry the dressing cues into the grey-box, and judge flow again there with light and paving. Principle 18: a long curve counts as a sideways run |
| 2026-11-22 | Flow critic, round 3 on plan D rev 3: 5/10. The cross road behind the great hall hid the player behind its wings, and the battery road ran 7 blind screens | Flow | Principle 20: never route behind something tall. Principle 18 now gives how far a cue shows (its height ÷ 2.5) and limits sideways runs. Rev 4 moves the cross road in front of the hall, as a balcony arc on the top terrace |
| 2026-11-22 | Flow critic, round 2 on plan D rev 2: 5/10. The diagonals didn't work either: only an arrival from the north shows a tall landmark early. Its frames also drew the armillary as a thin pole, though it's about 16 u across | Flow | Principle 18 rewritten: arrive from the north on the landmark's axis. The plan tool now draws landmarks at their real width (`landmark(..., radius)`): a frame has to show what the game would. Rev 3 brings every main arrival through the great hall and down one grand stair |
| 2026-11-22 | Flow critic, round 1 on plan D (frames from the plan tool): 4/10. Only the north road led; from the yard and the battery the armillary first showed 7 screens in, because those routes ran across the screen | Flow, the first time it ran | The frames step was added to the plan tool. Principles 18 (approach up or down the screen) and 19 (show the destination when leaving) went into the checklist. Plan D rev 2 re-cut every main route onto a vertical or diagonal |
| 2026-11-22 | Structure critic, round 1 on the courtyard. Plans A 5, B 7, C 6; the current build, shown blind as a control, 4. It recommended B with A's round plaza and C's inlet, which became plan D; the user chose D ("these outlines look a lot better") | (calibration) | The control scoring 4 counts as the brief's calibration. Showing the current build blind is kept as a standing check in each structure round |
