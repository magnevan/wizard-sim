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

## The user's call: 32 px goblins, a bigger wizard of the same design

The user, after the lineup: the 32 px goblins are about the right scale; the wizard should grow instead, to about 50 px. The PixelLab wizard is "a hard no": keep the current one, "bit top hat, no face, beard, very classic wizard vibe". Today's wizard is too small for the environment too: beside the battery's equipment chest it can "barely peak into it". The art direction is simple, so it's flexible.

Built: `?wizscale=` (1 to 2) in `game/packages/client/src/art/rigs.ts` scales the wizard rig's geometry, not its pixels: positions, widths and line weights grow, the robe and hat are drawn in finer steps, and 1 px details stay 1 px, so it keeps the bought sprites' density. At 1 every rig paints pixel-identical to before (checked against the old renders). At 1.7 it's 49 px tall and looks over the chest (`tools/warband-art/img/wiz-stores.png`); next to it the 32 px goblins are about 0.6 of its height, as in the concept.

- Left as a URL switch, not the default: until the goblin sprites are wired in, the game's 15 px goblin rigs would look tiny beside a 49 px wizard.
- The chieftain is about 2.5 wizards tall at 1.7 (121 vs 49 px); for exactly twice, regenerate it at about 100 px.
- The sim's sizes (body radius, reach) don't change, so the drawn wizard is wider than its hit circle; worth checking in play.

## A smaller chieftain

The user: the 128 px chieftain is too big; height is close, "but in overall size/volume he's just way out of scale with the other goblins". Redrawn at 96 px (3 generations) as "the biggest goblin of the warband ... with the same goblin build": 89 px tall with its maul (about 1.8 bigger wizards) and visibly leaner. It shares the band's bright green, outline and chunky shapes, and its cape became one big blue academy banner. All eight facings hold. The 128 px one is kept in the library.

The bought goblins have one pose each so far: standing, in eight directions. The only animation is the round 1 raider's run.

## One goblin in motion, and two ways to die

The user asked for walk and attack on one goblin, and to try code or Codex for the deaths. The hooded raider at 32 px, the most common enemy:

- **Walk** (PixelLab's `walking` template, 6 frames × 8 directions, 8 generations): the goblin stays itself and the stride reads, but **the blade is dropped** in most directions (a stray streak remains in one east frame). The template redraws the body on a skeleton and loses small held items; the round 1 run at 64 px kept its blade. A retry as a v3 custom walk "holding its curved blade" (8 generations) should keep it.
- **Attack** (v3 custom, 9 frames × 8 directions, 44 px canvas, 8 generations): the blade survives every frame and the overhead wind-up is a readable telegraph. East is clean; south and south-west turn to face another way partway through the slash, and north reads weakly. Fixable by redoing those directions alone.
- **Code deaths** (`tools/warband-art/deaths.py`, free): the game's own death styles from `art/deaths.ts` run on the sprite's pixels: topple (stiff tip, a poof), fire (flames off the top edges, char, crumble to ash), shatter (frozen, tips over, breaks into shards) and arcane (violet seams, pieces drift apart). Every direction and element comes for free, and wiring it means letting `capture()` take a sprite instead of painting the rig.
- **Codex death** (6 frames, free on the subscription): the most charming and story-like (the blade flies, it lands flat, the loot sack spills coins, a poof), and it converts cleanly at its own grid (about 8.7 screen px per art px; 64 colours keep the blue hood). But the goblin drifted: rounder and bigger-headed, a little bigger than the sprite, and it faces the camera only.

Claude's pick: code deaths, borrowing the Codex strip's ideas as code (the dropped blade, the spilled loot).

## From 3D models: motion that costs nothing per frame

The user's constraint: PixelLab animation is too dear for iteration (and glitchy: the south-west attack swaps hands, east uses the left hand, north hits behind its back), and the goal is roughly a warband a day, which no per-frame budget covers. They asked to try three model sources: one built by Claude in Blender, one made by Codex, and image-to-3D (Meshy's free tier, driven by the user).

The pipeline (`tools/goblin-3d/`): a model on a shared goblin skeleton, the moves as code (walk, run, attack), every frame rendered from the game's camera in 8 directions, then turned into pixel art. All free; 240 frames in about 40 seconds.

- **Claude's model** (`raider.py`, primitives): reads as the goblin, simple and round; the face is weak and the hood reads a little like a helmet.
- **Codex's model** (`raider_codex.py`, a Blender script Codex wrote from the turnaround, and checked in Blender itself): the better design, with a real hood opening, a scowl and wrapped forearms. It came back in one try and needed no fixes.
- **Meshy**: Codex drew two input pictures (`input/meshy-front.png`, an A-pose front view; `input/meshy-views.png`, front, side and back). The user uploads one and hands back a `.glb`; the one-piece mesh path is tested.
- **The pixel step mattered more than the model.** Snapping the lit render to PixelLab's palette washed the hood out, and freestyle lines turned to noise at 4x. What works: a flat render gives each pixel its part, the lit render gives one of four tones per part (shadows lean blue, lights warm), the darker part at a seam gets a dark line, and the outline goes outside the silhouette so a two-pixel blade stays steel. A 1.15 x 0.92 squash makes the figures as squat as drawn sprites.
- **Motion:** the slash is in front, in the right hand, in every direction, because the code can't do otherwise. The first pass had every forward swing backwards (a sign error, fixed); this is the class of bug code makes, and it's fixed once for every goblin.
- Against PixelLab, both are less detailed (fewer textures, plainer faces), but the same goblin from every side.

Claude's pick: motion from 3D. Wait for the Meshy row, then choose the model source; next, a fuller face and finer detail in the pixel step, and a second goblin on the same skeleton to prove the reuse.

## Claude's picks, pending the review

1. Settled by the user: the round 2 set (32 px) and the current wizard drawn at about 1.7× (`?wizscale=1.7`). Make 1.7 the default when the goblin sprites go in.
2. Then buy run, attack (with its telegraph pose) and death for all six, about 170 generations, checked frame by frame.
3. Wire the goblins in as sprites in the battery, behind a toggle against the rigs, with statuses as tints and overlays and 16 facings snapped to 8.
4. Keep round 2's bright olive skin for any further goblins.
