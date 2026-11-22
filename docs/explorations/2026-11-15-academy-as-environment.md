# The academy as environment, a concept (2026-11-15)

> **Archived 2026-11-22.** Taken off the segment page with the old yard layout it was drawn over ([record](../archive/opening-segment-old-layouts-2026-11-22.md)). Its real-size rules are in the page's rules of scale; its direction continues in [the weapons section](2026-11-22-weapons-yard-and-walks.md).

After the kit-built buildings were rejected ([Buildings are environment](../decisions/README.md#2026-11-14-buildings-are-environment-not-assets-the-kit-buildings-rejected)), the user agreed to "start that concept": the academy round the drill yard, designed as the place itself at real size, before any art. It's on the [Opening Segment](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) page under "The academy as environment", with a verdict mark (`ratings/concept-academy`) and three questions (`answers/r5-academy-court`, `r5-academy-route`, `r5-academy-build`). Nothing is decided.

## Real size

- A wizard is 0.9 u across and 1.8 m tall. 1 u on the ground is about 0.6 m, and a metre of height is about 14.5 art px (a 26 px wizard, hat included, measured in the game).
- The rejected kit hall was about 8 × 4 m. A real academy range is 40 to 60 m long.

## The concept

| Block | Size | Where |
|---|---|---|
| Great Hall | 35 × 22 m, walls 14 m, ridge 24 m, buttresses every 5 m | Along the yard's west edge. Its inside is the lecture hall of beat 1 (30 × 20 m, the 50 × 34 u map), with its 3.2 × 5.2 m door onto the yard |
| Workshops | 12 m deep, three storeys (5 + 4 + 4 m), ridge 19 m, a 60 m+ range | Along the yard's north edge |
| Gate tower | 7 m square, 24 m walls, 29 m to the top | In the workshops, over a 4 × 5 m passage where the gatehouse stood: the way out to the battery |

- **Only the far sides.** The camera looks toward the plan's north-west, so a building there rises off the top of the screen without hiding play. A building on the south or east would stand between the camera and the yard. The near sides stay open (garden, drill ground, woods) or low, or would need a fade.
- **What the camera shows.** A facade's foot sits about 11 art px up the screen for each unit you stand from it, and half the 270 px view lies above the wizard. So one screen shows about 6 m of a facade from 4 u away, 3 m from 8 u, and only its foot from 12 u. The ground floor carries the art; the storeys above are seen as you walk along.
- **The finding that moves the yard:** from the middle of the yard as built (the parry lane, about 25 u from both ranges) no building is on screen. The proposal moves the lessons along the two ranges (strike and Heavy along the hall, the parry lane and the hands ring along the workshops, the rack and passage by the tower) and leaves the middle and the open sides to the soldiers, the casting line and the garden.

## The grey box

`?massing=academy#yard` draws the blocks in the game as plain grey boxes with their windows, doors and the passage, at real size (`game/packages/client/src/art/massing.ts`). It's client only: the sim never sees it, nothing collides with it, and no hash changes. Props under the blocks are hidden while it's on. `npm run massing` (in `game/`, after a build) takes the shots in `game/shots/massing-academy/`; `tools/segments/01-opening/academy-concept.py` draws the plan and section and copies the shots to the page.

## Open, on the page

1. A courtyard closed on all four sides, or two ranges open on the near sides? Pick: two ranges.
2. Move the lessons along the ranges? Pick: yes, along the red route.
3. How the facades are made: pieces at real size placed on the map (repeating bays, like the battery's wall), or one painted backdrop per range? Pick: pieces, with the descriptions for approval before anything is bought.
