# The goblin warband as bought sprites, round 1

Art purchase, 2026-11-16, from [the opening's encounters](2026-11-16-opening-encounters.md) (its warband concept sheet). The user asked to turn the explorations into more fleshed-out assets for the warband, whose game art is still code-drawn placeholder rigs (`game/packages/client/src/art/rigs.ts`). Review page: [Goblin Warband Art](https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ) (`tools/warband-art/`). Where it ended: the six goblins and the wizard are drawn live from 3D models in the game, the wizard at 1.4x ("Live 3D in the game", below); the sections before it are the steps on the way, and their statements hold for their date.

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

The pipeline (`tools/sprites-3d/`): a model on a shared goblin skeleton, the moves as code (walk, run, attack), every frame rendered from the game's camera in 8 directions, then turned into pixel art. All free; 240 frames in about 40 seconds.

- **Claude's model** (`raider.py`, primitives): reads as the goblin, simple and round; the face is weak and the hood reads a little like a helmet.
- **Codex's model** (`raider_codex.py`, a Blender script Codex wrote from the turnaround, and checked in Blender itself): the better design, with a real hood opening, a scowl and wrapped forearms. It came back in one try and needed no fixes.
- **Meshy**: Codex drew two input pictures (`input/meshy-front.png`, an A-pose front view; `input/meshy-views.png`, front, side and back). The user uploads one and hands back a `.glb`; the one-piece mesh path is tested.
- **The pixel step mattered more than the model.** Snapping the lit render to PixelLab's palette washed the hood out, and freestyle lines turned to noise at 4x. What works: a flat render gives each pixel its part, the lit render gives one of four tones per part (shadows lean blue, lights warm), the darker part at a seam gets a dark line, and the outline goes outside the silhouette so a two-pixel blade stays steel. A 1.15 x 0.92 squash makes the figures as squat as drawn sprites.
- **Motion:** the slash is in front, in the right hand, in every direction, because the code can't do otherwise. The first pass had every forward swing backwards (a sign error, fixed); this is the class of bug code makes, and it's fixed once for every goblin.
- Against PixelLab, both are less detailed (fewer textures, plainer faces), but the same goblin from every side.

Claude's pick: motion from 3D. Wait for the Meshy row, then choose the model source; next, a fuller face and finer detail in the pixel step, and a second goblin on the same skeleton to prove the reuse.

## From 3D, round 2: Meshy, and moves with weight

The user's verdict on round 1: Claude's model is poor, Codex's reasonable (one sample, so its steadiness is unknown). The moves were stiff: the run wants a forward lean and side-to-side movement, and the slash had no weight, where PixelLab's steps in and swings the body.

- **Meshy** (the user ran it on Codex's front picture): the closest to PixelLab at 32 px, chunky with the face, star and sack readable. It dropped the blade, so Codex's is grafted into its hand (`--add`). It came as 442k vertices, thinned to 20k. Its joints were fitted once from a gridded front and side view (`output/model.joints.json`, a few minutes); Blender's automatic weights failed silently, and nearest-bone weights needed bone thickness, or the arm took an ear.
- **Moves:** the walk sways over the standing foot with the pelvis dropping and shoulders against hips; the run leans hard, rocks, pumps, kicks up and leaves the ground; the attack crouches and coils with the blade high over the right shoulder (so the warning shows from every side), steps in, uncoils hips then shoulders, slashes diagonally across, holds the impact two frames, recovers. Bugs on the way: arm turns composed in the wrong order (a T-pose wind-up), and a raised arm's tilt sign flips, which hid the blade behind the head.

Claude's pick: Meshy for models (Codex draws its input), motion from 3D. Next, a second goblin through the same steps to see how steady Meshy is and what fitting costs, and a small preview for tuning moves instead of editing numbers.

## Camera height for characters

The user noticed PixelLab draws the goblin closer to face-on than the 3D renders, which use the ground's 30 degrees. Drawing characters lower than the ground is the usual cheat in 2D games with a high camera: faces and fronts read better. `render.py --elev=` tries it on Meshy's raider at 30, 20 and 10: at 30 hood and sack dominate and the face is a sliver; at 10 face, eyes and legs show and the proportions match PixelLab's (about 3 px taller). The cost is a figure that looks stood up on the ground rather than seen from above, most visible at the feet and shadow. Claude's pick: 15 to 20, checked in the battery scene.

The user also raised Meshy's paid tier (rigging, an animation library, text-to-3D). Unanswered by tests yet: whether its library motion suits a chibi goblin and weapon attacks, and whether text-to-3D holds the house style as well as a Codex picture the user can approve first.

## From 3D, round 3: Meshy's rig and animation library (2026-11-17)

Through the Meshy MCP server, with the user's sign-off for 40 credits: the raider was remeshed to 30k triangles (5; Meshy rigs at most 380k, and the web-app model was 824k), rigged (5, with a walk and a run free), and given ten library clips (3 each): Slow Orc Walk, Sneaky Walk, Lean Forward Sprint, Standard Forward Charge, Left Slash, Right-hand Sword Slash, Thrust Slash, Charged Slash, Combat Idle, Knock Down. `render.py --anim` plays a rigged model's own clips through the same camera and pixel pass, cancels the hips' travel so sprites stay in place (`--root` keeps it), and carries the grafted blade to `RightHand` through hand frames built from the forearm and the forward axis, so bone roll doesn't matter.

What it showed: the library slashes have the weight the user asked for (wind-up, step in, whole-body swing), Left Slash and Thrust Slash most of all. They run about 3 s against the code attack's 1.5 s, which is fixable for free by sampling faster. The body turn hides the blade behind the sack for a few frames in some directions. Lean Forward Sprint has the lean the free run lacks. Knock Down gives an 8-direction fall for 3 credits. Meshy rigs only humanoid bodies, so non-humanoid creatures keep the code moves.

The user's point on cost: don't make a high-poly model and pay to thin it. Smart topology (`meshy-t2.5`, `target_polycount` about 15k, T-pose) costs 15 credits textured instead of 30 and rigs as made; it's the default for the next goblins.

Claude's pick: library clips for humanoid enemies (free walk, Lean Forward Sprint, Thrust or Left Slash at about 1.5 s, Combat Idle, Knock Down), code moves for the rest. Next: a second goblin made with smart topology and rigged, and a test of copying these clips onto it in Blender (every Meshy rig has the same 24 bones), which would make a clip a one-time cost.

**The user's reply (2026-11-17):** the clips are very good, but buy only what a mechanic uses. Slow walk (maybe for chilled, later) and sneak have no mechanic, and combat idle isn't needed yet (perhaps later, for moments the AI has nothing to do). About three attack variants per enemy, depending on the enemy, so attacks look varied. Knock Down is the default death. Next: fill out the roster's animations first; elemental deaths later. Claude's plan for that: per member, a Codex T-pose picture (approved first), a Meshy smart-topology model (15) and rig (5), the weapon grafted, owned clips copied onto the new rig in Blender if that works (the first new goblin tests it), each attack retimed to the game's wind-up, strike, impact and recovery beats, then the usual render and pixel pass. New clips only where a member's mechanic needs one: an archery shot, a shield guard, a hook throw, a ground slam.

## The roster into the game (2026-11-17, autonomous run)

The user approved all five pictures and asked for the pipeline to run to the game unattended (Meshy cap 200, then 300 credits; spent 142). Each goblin: a Meshy smart-topology model (15, `meshy-t2.5`, 15k triangles, T-pose), a rig (5) and only the clips its mechanics use (3 each). Weapons are small Blender props attached to a bone (`props.py`). `roster.sh` renders every clip in 8 directions at 20 degrees and pixelizes it; `pack.py` packs one sheet per goblin (`game/content/assets/sprites/<slug>/`) and warps each attack so its wind-up, strike and recovery land on the game's beats, with the strike found as the weapon hand's fastest step. The client's `art/sprites.ts` draws them in place of the code rigs (on by default, `?sprites=0` for the rigs), with the wizard at 1.7x while they're on. *(Later: 1.4x, and all of them drawn live from 3D; see "Live 3D in the game".)*

What showed up on the way:
- Running six Codex picture jobs at once overloaded its sandbox: every image was made but none saved; they were taken from `~/.codex/generated_images/`.
- The chieftain was cropped and its maul read as a stick: the camera now aims at the scaled body's middle, the maul head is bigger, and it renders at 1.8x a goblin.
- The archer's bow vanished at 32 px (made thicker) and its strike was tracked on the wrong hand (now the draw hand).
- The hooker's Meshy texture came out lime; `pack.py` grades it toward the band's olive. Still a little yellow.
- The raiders' wind-up is mostly a held guard pose before the body-spin slash; it reads as a telegraph but is less dramatic than the full clip. The archer's draw is subtle.
- Deaths are the knock-down for every sprite goblin, then lying still and fading; the code rigs' elemental deaths don't play on sprites yet (the user's order: roster first, elemental deaths later).

Checks: `npm run check` (632 tests) and `npm run check:browser` passed; only drawing code changed. In an arena screenshot the goblins stand at about 0.6 of the 1.7x wizard's height. The page's last section ("the whole band, in the game", rating `ingame-band`) shows it.

Open after the run, for the user's review:
- The sprites' shadows are long (the sprites are taller than the rigs), and the goblins overlap at the old, tighter spacing.
- The chieftain's 96 px frame may clip its widest swings at the sides (the run's estimate; not checked in play).
- Statuses only tint the sprite and a hit flashes it white; elemental deaths on sprites come later.
- Whether owned clips copy onto a new Meshy rig for free is still untested.
- Not merged to main (a push to main deploys the public game).

## Attacks at their own speed (2026-11-17)

The user: the animations look good overall, but notes about warping attacks to fit timings, and about attacks being less readable, assume dodging is a big part of the game. It might matter for really large enemies; nobody should have to watch a goblin to dodge it. What matters is that attacks look smooth.

The warp did hurt that: the hooded raider's left slash showed frames 5,5,6,6,6,6,7,7 across its 0.6 s wind-up (the "held guard pose" above), the blow for about one 60 Hz tick, and the chieftain's last seven of 16 frames were the same two. So `pack.py` now keeps every clip frame at 12 fps and marks the contact frame, and the client plays it in real time with contact on the hit tick: an even five ticks a frame. A longer game wind-up holds the clip's first pose; a shorter one starts it partway (archer 2 frames, chieftain 4, hooker 5). The chieftain's swing hadn't played at all as a sprite (the brute's attack state went to `s.smash`); it does now. Logged in `decisions/README.md`.

The review page also said "a raider picks one of its three slashes for life": the client picked the variant from the body's index, for every goblin with more than one clip (the shieldbearer too). The user: cycle or randomise; pick deliberately only where attacks differ in what they do. Now each swing picks at random. The page's caption and its "held guard" note were updated (version 14).

## The archer's shot, and 12 or 24 fps (2026-11-17)

The user: the archer's attack looks off, the goblin holds the bow in a weird way, and it snaps back at the end. Found four faults:
- Meshy's Archery Shot stands side-on and shoots out of the character's left side, so the arrow left 90° off the goblin's facing. `render.py --yaw=archery_shot:-90:14:30:48:58` turns the body side-on as the bow comes up and back as it lowers, so the shot follows the facing and the clip starts and ends in the idle's stance.
- The bow's limbs sat on the hand's Y axis; measured in Blender, Z is world-up at full draw (about 0.99), so at full draw the bow lay nearly flat. Now on Z.
- The string was a rigid rod. It now bends back to the drawing hand with an arrow nocked until the release (`--release=archery_shot:39`).
- `pack.py`'s strike (the hand's fastest step) was frame 14, the reach for the arrow, so the game fired before the draw; the hit is now the release, frame 39 (ROLES `tune`), and the held full draw (34 to 38) is left out so the 1 s wind-up shows the draw rising. The end search stopped at the pause after the shot with the bow still up (frame 38 of 60): it now searches back from the clip's end, which lengthens every goblin's recovery a little, and the client lets a sprite finish its recovery after the sim's cooldown ends (`hitAt` in `view.ts`) instead of snapping to walk or idle.

Left: the 1 s wind-up is shorter than the clip's raise, so the shot starts partway into the turn (a small jump from idle). The fix would be a longer archer wind-up (gameplay) or starting the draw while it lines up.

The user also asked why 12 fps: it's `render.py`'s `ANIM_FPS`, the usual pixel-art rate (at 32 px most moves are a pixel or two a frame; fewer frames read crisper and keep sheets small), carried over from the PixelLab work rather than tested on these clips. Fast blows get one or two frames at 12. The review page (version 15) shows the hooded raider's Left Slash at 12 and 24 fps side by side (`fps-attack`) and the archer before and after (`archer-shot`).

## The wizard from 3D (2026-11-17)

The user liked the wizard's design but not how the code rig held up at 1.7×: it grows its shapes, not its detail, so beside the Meshy goblins it read as flat slabs. It went through the same pipeline with its design unchanged (big floppy hat with a gold band, no face, white beard, bell robe with gold trim): a Codex model sheet the user approved, then 38 Meshy credits the user signed off (model 15, rig 5, six clips: gathering, the Force push, Area, Self, a staff strike, Knock Down). The staff is a Blender prop that keeps near upright as he walks (`render.py` soft props). One red sheet is recoloured per seat in the client from `TEAMS`. In the game: walk, run, gathering (a loop), the Force cast (held at full stretch) and death play; `?wizsprite=0` keeps the code rig. Details and what isn't wired yet: `tools/sprites-3d/README.md`, "The wizard". On the review page as `wiz-3d`. *(Since then drawn live from its model at 1.4x, with Self, Area and the staff blow playing their clips and spells starting from the live staff's tip; see "Live 3D in the game".)*

## Slow goblins: 24 fps sheets and a real-time 3D test (2026-11-17)

The user: at 12 fps a slowed goblin gets choppier still; could the 3D models be drawn in the game directly, with the pixel look as a shader? Both were done:
- **24 fps sheets.** `roster.sh` renders at 24 (`render.py --fps`); the client plays clips on the game's clock, so a slowed goblin steps through the extra frames. Five of six sheets are 24 fps; the chieftain's render was stopped for low memory and stays at 12 until re-rendered. Two bugs on the way: `pixelize.py` matched only `f??.png` and `pack.py` sorted names as text, both wrong past frame 99. At 24 fps the wind-up start detection trimmed too close to the hit, so `pack.py` now keeps 1.2 s before it. The render is slow (about 40 minutes a roster; see `tools/sprites-3d/README.md`).
- **Real-time 3D** (`prototypes/02-realtime-3d`): the hooded raider drawn live with three.js beside its baked sheet, through `pixelize.py`'s rules as shaders. The user saw the first pass outline only silhouettes where the baked frames line every edge between parts; the pass was rebuilt in pixelize's order (part, then tone and seams). On an AMD Radeon 780M 100 live goblins hold the frame cap, 200 reach about 50 fps (CPU skeleton posing). The look moving (flicker on edges as they turn) is the user's call: the review page's `rt3d`.

## Live 3D in the game (2026-11-17)

The user, on the prototype: "The 3D version is much better, and it's going to be the more flexible approach. Let's do this for all the characters." Built for the six goblins (`art/live3d.ts`, models from `tools/sprites-3d/export.sh`); the wizard's model was on another branch then. Watching it in the dev server, the user saw the goblin slide forward while attacking and the walk not match its speed: the game creeps a goblin forward at 30% speed through its recovery while the clip stands still, and the walk cycle ran at a fixed 14 px a loop tuned for the code rigs, rounded to 8 steps. Now walk and run go by distance over each clip's measured stride, a creeping recovery crossfades into the walk after a quarter-second follow-through, and live bodies use the unrounded facing. The user also set the wizard's scale to 1.4 (1.7 was too big). A software renderer can't keep up (a headless screenshot took over four minutes), so it falls back to the sheets.

The wizard followed: the other session's branch ("The wizard from 3D", above) was merged in, and the wizard exported and drawn live at the user's 1.4x, with its seat recolouring and the staff's upright correction moved to the GPU and its gathering and Force-cast poses driven from the rig state. Its baked fallback sheet is still at the old size (1.55 height, for 1.7x); the user: no new fallback sheet is needed.

**Marks on the review page (db `ratings`, read 2026-11-17):** `ingame-band` keep, `archer-shot` keep, `rt3d` live (built, above); all five roster pictures and `con-weapons` approve ("Maybe spear should be longer, but its hard to guess without seeing it on the model"). Not marked yet: `wiz-3d`, and `fps-attack`, which live 3D makes moot (a live model plays at any rate; the sheets are only the fallback).

**Follow-ups (the user, 2026-11-17):**
- **A conjured weapon on the live wizard.** The code rig drew the conjured weapon in the wizard's hand in place of the staff (`RigState.bare`); the live model still holds its staff. Give the live wizard the weapon (a prop per weapon on the hand, as the goblins' props, or the rig's drawing composited) and hide the staff while it's held.
- **Walk and run tuned to the real movement speed.** The clips now play by distance over their measured stride (feet planted), but each body's speed differs from its clip's natural pace (a goblin moves about three times the walk clip's own speed), so some cycles play fast. Go over every walk and run: which clip at which speed (the walk-to-run threshold), whether to pick or buy clips nearer each body's speed, and the stride measurement itself.

**The Model Viewer (2026-11-17).** Asked for better tooling to see the models and their animations, Claude built a dev page, `/models.html` on the dev server (`game/packages/client/src/lab/models.ts`; never built, as the other labs). It shows any live model full size (orbit, pan, zoom, and a button back to the game's camera) beside the game's own pixel renderer (the same `liveFrame` and `flushLive` calls the game makes), every clip on a timeline marked with the game's timings (an attack's first, hit, last and cut hold, a cast's release, the wizard's one-shot start and Force hold, a body turn), and switches for 8 facings, a line-up of every model at game size, onion skin, the skeleton, the sim's radius and reach, a seat's colours, the hit flash, a second clip blended in, and "play as the game". Its state is in the URL's #hash. The user then asked for an idle entry (the walk's first frame, which is what the game shows standing).

The weapons and cast effects (stage b) and the play area (stage c) became one piece, the real game: the conjured weapons are animated 2D drawings at the hand (`view-structures.ts` `weapon()`) and the spells are the sim's, so a copy in the viewer would drift. The Tools panel (F3) gained a Stage section (`stage-tools.ts`, opened from the viewer as `index.html?stage=1#sanctum`): enemies held still, any enemy driven as a puppet with the mouse (its attacks are the core's own, so a wizard in reach is struck, shot or grabbed; God mode is on), and any weapon conjured at a click. Held enemies flinch, take knockback (and stay where it puts them) and play their deaths. Enemies can only hit wizards (`isPrey`), so a puppet can't hit another goblin. A conjured weapon still draws in 2D beside the live wizard's staff: the first follow-up below stands.

**Cracks at full size.** The user saw "cracks and gaps" on the models in the viewer's full-size view. Not the renderer: the export cut each Meshy texture (2048 px, hundreds of small UV islands on black with no margin) to a 256 px JPEG, so every island was a few pixels and sampling pulled the black between them in at its edges, with JPEG fringes on top; at 40 px in the pixel pass none of it shows. `export_game.py` now pads each island 16 px over the black at full size, then cuts to 1024 px (JPEG quality 90): the seams are gone and the seven models grew to 4.8 MB in all. The Meshy downloads had been gitignored and were gone with an old worktree; they were fetched again from their tasks (no credits) and are now committed (102 MB, `tools/sprites-3d/output/`). What still looks rough close up, such as the hooded raider's ragged hood, is the mesh thinned to 5,000 triangles (`--tris`), which the pixel pass doesn't show.

Its "drive by speed" check gives the numbers for the walk-and-run follow-up. A clip's natural pace is its stride (x 1.15, the squash) per loop; the game plays run from 2.52 u/s (0.6 of a wizard's 4.2):

| Model | Game speed (u/s) | Clip the game plays | Walk's pace | Run's pace | Plays at |
| --- | --- | --- | --- | --- | --- |
| wizard | 4.2 | run | 1.47 | 2.96 | 1.42x |
| raider-hooded | 3.2 | run | 1.25 | 2.48 | 1.29x |
| raider-goggles | 3.2 | run | 1.21 | 2.42 | 1.32x |
| hooker (grabber) | 2.8 | run | 1.15 | 2.31 | 1.21x |
| archer | 2.4 | walk | 1.19 | 2.38 | 2.02x |
| shieldbearer | 2.2 | walk | 1.36 | 2.73 | 1.61x |
| chieftain (brute) | 1.8 | walk | 2.84 | 5.66 | 0.63x |

The archer and the shieldbearer walk at twice and 1.6 times their walk clip's pace while their run would fit (1.0x and 0.8x), and the chieftain's walk is too slow a clip for its speed. A threshold per body (or run for both) would fix the first two without new clips.

**Animation fixes from the viewer (2026-11-17, branch `worktree-anim-fixes`, on top of the viewer's).** The user, watching the clips in the Model Viewer: weapons stay in the dead hand; the staff seems tied to the elbow, doesn't swing naturally in the blow and dangles in casts; queuing runes shouldn't play a cast; walking while casting slides; spells should come from the hands; the shield isn't held in a blocking orientation; the shieldbearer's attack0 seems two moves in one. What was wrong and what changed:
- **The staff** ran back along the forearm from the palm (`props.py` `STAFF_DIR` was -X), so its shaft lay on the arm past the elbow, and its soft correction (keep 25% of the hand's tilt) turned it about the wrist in every move. It now runs through the fist as a sword's grip does (out of the thumb side, like the knife), turns about the palm, keeps 10% of the hand's tilt walking, and the staff's blow holds it firmly (`--firm=sword_slash`; the client eases the grip in over 0.12 s and out over 0.35 s), so it swings with the hand. The casts keep it soft: held firmly, the two-handed push laid it flat across the body like a quarterstaff, while held near upright it rides in the fist and is pushed forward with the hand.
- **The shield** faced the forearm frame's Z (the T-pose's forward), which left it edge-on in the push. It now faces out from the back of the forearm, centred over the hand (a centre grip), so a forearm raised across the chest holds it square to the front.
- **Death:** every prop now hangs from one carrier node on its bone (a grafted blade too), listed in the model's json; one held in a hand lets go 0.25 s into the death, falls under gravity and tips over to lie flat beside the body (`live3d.ts` `dropProps`, worked out from the clip time alone). A strapped shield stays on.
- **Runes:** queuing runes plays no clip (the gather loop is gone from the game; the viewer still lists it). Only the cast plays.
- **Walking while casting:** each clip is split into an upper half and a lower one (hips and legs) at load; a cast or blow while the wizard moves plays the cast on the upper body over the walk or run's legs, and every one-shot or attack eases back into the legs over 0.3 s after its last frame instead of snapping.
- **Spells from the hands:** a live caster's tip and charge anchors (where its spells, orb and queued runes are drawn) are between its palms, leaning toward the hand further forward, so they don't depend on the staff. Standing with runes queued, that's at hip height.
- **The shieldbearer's thrust:** Meshy's Thrust Slash thrusts (clip frames 0 to 8), then turns away, winds back and lunges into an overhead slash. Only the thrust is kept (`roles.py` tune hit 8, end 10), easing back to its stance; the shield push is unchanged. A dedicated spear-thrust clip would cost 3 Meshy credits if the trimmed thrust reads too short.

New tooling: `render.py --inspect=<n>` renders n smooth stills a move from the south and the east (Workbench, with props and the soft staff as the game turns it) and `montage.py` lays them out, for checking a prop in the hand before an export; the viewer has a Legs option (a clip over walking or running legs).

## Claude's picks, pending the review

*(Superseded on 2026-11-17: motion comes from 3D, not PixelLab, and the goblins and the wizard are drawn live from 3D in the game; see the sections above.)*

1. Settled by the user: the round 2 set (32 px) and the current wizard drawn at about 1.7× (`?wizscale=1.7`). Make 1.7 the default when the goblin sprites go in. *(Done: 1.7 was the default while sprites were on; the user then set 1.4.)*
2. Then buy run, attack (with its telegraph pose) and death for all six, about 170 generations, checked frame by frame.
3. Wire the goblins in as sprites in the battery, behind a toggle against the rigs, with statuses as tints and overlays and 16 facings snapped to 8.
4. Keep round 2's bright olive skin for any further goblins.
