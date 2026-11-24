# Waterfalls (a reusable, procedural piece)

Status: active; round 1 of style concepts made, waiting on the user's pick · Last touched: 2026-11-24
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

## Next

- [ ] The user picks a style (or a mix) from round 1.
- [ ] Then the design question before any build: what the piece is in the editor (an object joining two water levels across an edge? found by the compiler wherever water meets lower water, like `arch.through`?), and what its knobs are (width, strands, boulders, mist).
- [ ] The concepts are not yet on the court scene's Concepts panel (`cli.mjs ref court add`): add them once the editor's server is known to be serving the right worktree.
