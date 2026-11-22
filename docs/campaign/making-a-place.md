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
| 0 | **Read** | The concept read as a plan: footprint, height tiers, edges, routes, landmarks, sightlines, how it joins its neighbours | Claude, checked against [the principles](level-design.md) | `NN-name/<place>-read.md` |
| 1 | **Structure** | **Three plans that really differ**, as plan specs, drawn from above and in the game's camera, extruded by height | Structure critic, then the user picks one (or a mix) | `tools/place-plans/` and the segment page |
| 2 | **Flow** | A walkable grey-box of the chosen plan, with heights, stairs, cliffs and water, and the main route marked | Flow critic on frames at play zoom along the route; [sense lint](#the-sense-rules) passes | LDtk level, `npm run shot:route` |
| 3 | **Sense** | The grey-box dressed with props in grey or rough art | Sense critic and the lint | Same level |
| 4 | **Beauty** | Codex art: buildings, props, ground, lighting | Beauty critic, the loop we already had | Same level |

**Divergence rule (stage 1).** The three plans can't share a footprint shape, and at least one has to make the user say "huh". Plans come from the read and the principles, never from an earlier blockout. When a later stage sends a place back to stage 1, it gets three new plans, not a patch.

**One source.** A plan spec is a small data file. It sets out the outline, the height tiers, the cliffs, ramps and stairs, the water, the building footprints with their doors, the routes and the landmarks. The diagram, the camera preview and later the grey-box level are all made from it, so a plan never has to be redrawn by hand.

## The critics

Each critic is a fresh agent. It gets only what its stage needs, and its brief below. Critics score from 1 to 10, and they name the **one structural change** that would help most before listing smaller fixes. A critic that could only suggest small fixes would keep us in a local maximum.

**Structure critic.** Gets the three plans (from above and in the game's camera), the concept art and the principles. Asks:
- Which plan is most interesting to stand in, and why?
- Is it varied in height: tiers, edges, places to look down from?
- Does its silhouette say what the place is?
- Does it sprawl, with places beyond it, or is it a box?
- Where's the grandeur, and does the camera see it?

It doesn't judge fidelity to the concept. The concept is a source of ideas, not a spec.

**Flow critic.** Gets frames at play zoom along the main route, from each entrance, plus the plan. It's asked to play first-time player: "Where would you walk from here, and why?" A wrong answer means the place doesn't lead. Then:
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
| A door has 3 u clear in front of it, and a path material leads to it | lint (planned) |
| Every gate and marker is reachable from the start along walkable ground | lint (planned) |
| Water always meets a shore, a quay or a cliff, never grass or paving directly | lint (planned) |
| Two ground materials meet with a transition: an edge tile, a kerb, or a scatter blend | critic, then lint |
| Nothing taller than knee height blocks a door, a gate, stairs or a sightline marked in the plan | lint (planned) |
| A building is drawn in front of what stands behind it and behind what stands in front (sorted by footprint) | engine |
| Stairs and ramps join two tiers at both ends; a cliff edge has a lip or a wall | lint (planned) |
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
| 2026-11-22 | Structure critic, round 1 on the courtyard. Plans A 5, B 7, C 6; the current build, shown blind as a control, 4. It recommended B with A's round plaza and C's inlet, which became plan D | (calibration) | The control scoring 4 counts as the brief's calibration. Showing the current build blind is kept as a standing check in each structure round |
