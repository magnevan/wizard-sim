# Segment 1, the opening: space diagram and asset list

**Stage 3, up for review (2026-11-09).** The user asked for this stage before any building: "My worry is that you'll build everything too tiny otherwise." The plans, the camera preview and the purchase list, word for word, are on the Opening Blueprint page (`tools/opening-blueprint/`). The beats are in `brief.md`. All of it is a proposal.

## The real numbers

| | |
|---|---|
| One screen at 1080p | 30 × 18 units visible: 11 ahead of you, 6 behind (the rune bar covers the rest) |
| Walking | 4.2 units a second, so about 7 s to cross a screen |
| Reach | Fire spray 4.5, Fire ring 3, Place 9, beam 12, turret 8 |
| A wizard | 0.9 units across |
| Today's rooms | 24 × 16 (smaller than a screen). Survive is 48 × 34 |

Those screen figures were for the old straight-on view. Under the isometric camera a screen is about 30 x 21 units along its diagonal axes, and rooms are diamonds. The page's camera preview is isometric.

## The five maps

| Map | Size (u) | Beats | Main zones |
|---|---|---|---|
| 1. Lecture hall and cloister | 50 × 34 | 1 | Hall 38 × 28, cloister 6 × 32 |
| 2. Drill yard | 56 × 42 | 2, 3 | Strike lanes, Heavy, Retreat, parry lane, hands test, focus rack |
| 3. The battery | 72 × 64 | 4–7 | Wall 60 long, four defences, killing ground 60 × 26, rear yard |
| 4. The vein trail | 86 × 40 | 8–10 | Storehouse yard, riven ground, camp |
| 5. The way through, holding ground | 76 × 62 | 11, 12 | Three pockets, holding ground 48 × 34 |

You walk north throughout, because the view reaches further up the screen than down.

## Engine limits to watch

- There's no hard cap on map size, because the nav grid grows to the largest room. Maps 3 to 5 are 2 to 3 times Survive's nav area, so path-finding cost needs measuring (`npm run perf`).
- **Each room has 40 static wall slots,** which blocking props share (1 or 2 each). Long straight walls are cheap and ragged rock edges are expensive. Survive uses all 40. Keep decorative props non-blocking, or raise the limit deliberately.

## Assets

On 2026-11-09 the user authorized buying the general art, so everything but the defence is bought (158 generations, with extra ground sets, alternates and a clutter sheet; 1,772 are left). Results are on the page. **The defence (20 generations) still waits for an Approve.**

The ground painter and the isometric camera are built. What's left before the art is in is using the wall kits.

## Open questions, on the page

Unanswered means the pick stands, except for purchases.

1. A defence reaches twice as far as a person. Pick: yes.
2. Build the battery first, as a plain playable room. Pick: yes.

## The user's notes on the look (2026-11-09)

- The stone floor's scale is fine.
- The grass was too busy, so its tiles were calmed (`calm` in `art/ground-room.ts`) and its scatter halved.
- "Overall the look feels a bit intense, but we haven't done anything with lighting yet, so maybe that'll help resolve it." A lighting pass is the next thing to judge the overall look by, before changing materials further.
