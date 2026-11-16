# The goblin warband as bought sprites, round 1

Art purchase, 2026-11-16, from [the opening's encounters](2026-11-16-opening-encounters.md) (its warband concept sheet). The user asked to turn the explorations into more fleshed-out assets for the warband, whose game art is still code-drawn placeholder rigs (`game/packages/client/src/art/rigs.ts`). Review page: [Goblin Warband Art](https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ) (`tools/warband-art/`). Nothing is wired into the game yet.

## What was bought

23 PixelLab generations (1,636 → 1,613); 36 by the end of the review so far (1,600 left). Raw files, ids and prompts: `game/content/generated/pixellab/warband/` (`briefs.json`).

| Goblin | Archetype | Canvas | Cost |
|---|---|---|---|
| Raider, goggles | swarmer | 64 px | 2 |
| Raider, hooded | swarmer | 64 px | 2 |
| Archer | caster | 64 px | 2 |
| Shieldbearer | shieldbearer | 64 px | 2 |
| Hooker | grabber | 64 px | 2 |
| Chieftain | brute | 128 px | 3 |
| Raider, hooded, size test | swarmer | 40 px | 2 |
| Raider, hooded: run cycle | 6 frames × 8 directions | 64 px | 8 |

All `create_character` v3, high top-down, eight directions, positive-only prompts with one shared style line.

## What it showed

- **The designs landed.** Each kept the brief through all eight facings: academy cloth as trophies, the brass machine-panel shield, the chain hook, the brass-banded maul. Nothing drifted between directions.
- **Density is the real question.** The bought props are about 30 px per metre. The chieftain matches it (121 px, twice a wizard's height). The small goblins came back at twice that, so they look oversized next to the dummy and crates. Halving them locally makes the size right but turns the faces to mush. A goblin generated at 40 px reads far better than a halved one, so the small goblins should be **drawn** at about 32 px, not shrunk.
- **The template run holds its shape.** Blade and sack stay rigid, unlike the morphing rings in the battery well's bought animations. The stride is short, and the blade hides behind the body facing east.
- Two of seven came out with brown or tan skin, which blends into dirt.

## Round 2: three ways to the right size

The user then said other paths than PixelLab were fine if the quality stayed as high. Three were tried for the small goblins and judged at game size on the dirt beside the dummy and the chieftain (`tools/warband-art/img/paths.png`):

- **A: PixelLab v3 drawn at 32 px** (10 generations, 1,613 → 1,603). The clear winner: crisp silhouettes, bright green skin that stands off the dirt, every prop readable, the same goblin in all eight directions. One stray grey cluster under the goggled raider facing south-east.
- **B: Codex, the five facing the viewer**, in the chieftain's style, then converted (`tools/warband-art/pixelize.py`). The best designs of any path, but drawn with about 100 px of detail per goblin and no real pixel grid, so at 30 px they turn to mush. The skin is yellow-olive (193, 174, 54) that only looked green against the magenta background.
- **C: Codex, one raider in eight directions.** Codex held the character through the turnaround by itself, on a real grid of about 8.5 screen pixels per art pixel (about 40 px figures). Converted, it's darker and blobbier than A, with tan skin and a strap it invented on the sack.

So the small goblins come from PixelLab drawn at the target size; Codex is for design sheets. Sources: `docs/reference/warband-sprites/`, prompts in `tools/concept-gen/prompts/2026-11-16-warband-sprites/`.

## Size against the game's wizard

The user couldn't judge size against the dummy prop and asked for the wizard in the game. Painted by the game's own rigs at 1x (`game/scripts/rig-lineup.mjs`), at 16 art pixels per world unit (`PPU` in `game/packages/client/src/camera.ts`):

| | Height (art px) |
|---|---|
| Wizard rig, with its hat | 29 |
| Goblin and archer rigs | 15 |
| Brute rig | 25 |
| Round 2 PixelLab goblins | about 30 |
| PixelLab chieftain | 121 |

So every bought sprite is drawn at about **twice the game's density**: the round 2 goblins are as tall as the wizard instead of half, and the chieftain is four wizards tall instead of two. The bought props were the wrong yardstick, as they're already oversized next to the wizard (the dummy prop is 40 px). The question is the game's density, not the goblins:

- **Keep today's density:** goblins about 16 px tall, the chieftain about 60, with most of the detail gone.
- **Double it:** 60 px wizard sprites, and the round 2 goblins and chieftain fit as they are. Costs: the wizards need sprites instead of the code rigs, the camera shows half the ground at the same zoom unless it zooms out, and the props look small and would need upscaling or redrawing.

A PixelLab wizard at 60 px (2 generations, plus 1 for a cancelled first run) shows the doubled version: `tools/warband-art/img/scene-doubled.png`. Claude's pick is to double it; that's the user's call (`q-5-scale` on the review page).

## Claude's picks, pending the review

1. Double the game's pixel density, then use the round 2 set (32 px), the round 1 chieftain and 60 px wizard sprites.
2. Then buy run, attack (with its telegraph pose) and death for all six, about 170 generations, checked frame by frame.
3. Wire the goblins in as sprites in the battery, behind a toggle against the rigs, with statuses as tints and overlays and 16 facings snapped to 8.
4. Keep round 2's bright olive skin for any further goblins.
