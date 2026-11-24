# Waterfalls (a reusable, procedural piece)

Status: active; the ribbon (concept A) chosen and built as a compiler-found piece; waiting on the user's look at it moving in the editor · Last touched: 2026-11-24
Record: the concepts: [`docs/reference/waterfall/`](../reference/waterfall/) · prompts: `tools/concept-gen/prompts/2026-11-24-waterfall/` · the water it joins: `game/packages/client/src/lab/kit-water.ts` · where it came from: [the courtyard on the kit](kit-courtyard.md) · branch `waterfall` (off `court-kit`)

## Why this thread

The courtyard's stream (`t-stream`, 4 m) stops at a rock lip past the bridge, and the sea inlet lies 10 m below in a gorge between the court's retaining wall and the wooded cliff. Nothing joins them. The user (2026-11-24) wants the fall built as a piece the map editor can reuse anywhere, "somewhat procedural", and wants Codex concept art first, to pick a style.

## Round 1: styles (2026-11-24)

Four styles painted over the grey-box of the real spot ([the grey-box](../reference/waterfall/falls-greybox-game.jpg)), and one parts sheet. All Codex, free.

| | Concept | What it is | What it would take to build |
|---|---|---|---|
| A | [ribbon](../reference/waterfall/falls-a-ribbon.jpg) | One smooth turquoise curtain with white streaks, a rounded crest, chunky foam at the foot | The least: a strip of mesh from the upper water's edge to the lower water, a scrolling streak shader in the kit water's colours, foam puffs at the foot. Any width and height |
| B | [cascade](../reference/waterfall/falls-b-cascade.jpg) | Five short falls over rock ledges, a pool on each | The fall becomes terrain: ledges and pools generated between the two levels (or painted as levels in the editor, with A's curtain between each pair). Needs horizontal room, which the gorge has |
| C | [weir](../reference/waterfall/falls-c-weir.jpg) | A dressed-stone weir, a carved basin, three spouts | A set piece (one Meshy model) plus thin code-drawn water. Lovely here, but a single place, not a reusable fall |
| D | [veils](../reference/waterfall/falls-d-veils.jpg) | Strands splitting round boulders, moss, mist, a rainbow | The most: boulder models placed down the face, the curtain cut round them, mist particles. The richest look, the hardest to keep readable |
| | [parts sheet](../reference/waterfall/falls-anatomy.jpg) | A's fall as five parts (crest, curtain, foot, mist, splitting boulder) at three heights | Shows the procedural idea: the same parts make a fall one, three or eight wizards tall |

Claude's recommendation: A as the base piece (it matches the code-drawn toon water already in the kit, and scales to any drop for free), with D's splitting boulders and mist as options on the same piece, and B falling out for free once two falls can be chained through a painted pool. C kept as a possible set piece for the academy side later.

## Built (2026-11-24)

The user chose A ("the one that's more general"). What was built, on branch `waterfall`:

- **A fall is painted, not placed.** Wherever a `water` level meets a lower `water` level across an edge (0.5 m or more), `compile.py` emits a `fall.curtain` for each unbroken run of the edge. No new editor tool: paint water at two heights side by side. A pond painted between two heights gives a cascade (concept B) for free.
- **`kit-fall.ts` draws it to size**, in the kit water's colours: a ribbon that bends over the lip on a quarter round and drops to the lower water (streaks running down, a white crest breaking into drips, ragged sides, foam climbing its foot), chunky puffs that swell and bob at the foot with drops hopping out, and a foam wash with rings on the lower water. Straight, cornered and curved lips all work.
- **The upper water runs to the lip**: no shore foam along it, and it flows toward the fall whatever its shape.
- **The courtyard**: the rock sill at the stream's end is repainted as stream, so the stream pours 10 m into the inlet ([in the game camera](../reference/waterfall/falls-built-court.jpg)). **`patch-falls`** is the test scene: a tall narrow fall, a 3 m one, a cascade through a pond and a lip that turns a corner ([picture](../reference/waterfall/falls-built-patch.jpg)).

Not yet judged: the motion (the pictures are stills). Known gaps: the fall is as wide as the straight part of the lip, so a stream's chamfered corners stay bare beside it; the stream north of the bridge doesn't know about the fall, so its flow may not match the part below the bridge; no sound.

## Next

- [ ] The user looks at it moving (`editor.html?scene=court`, or `?scene=patch-falls`) and says what's off: speed, streaks, foam, puffs.
- [ ] Options on the piece, if wanted (an object on the edge, like an edge override): boulders that split the curtain and mist (concept D's parts), a narrower or thinner fall.
- [ ] Flow for the whole stream (every body of water upstream of a fall flows toward it, under bridges too).
- [ ] Merge `waterfall` into `court-kit` once the user is happy.
- [ ] The concepts are not yet on the court scene's Concepts panel (`cli.mjs ref court add`).
