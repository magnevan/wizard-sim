# Sprites from 3D

Character sprites from 3D models, for any creature (the goblin warband was first, and its hooded raider is the worked example): a model goes on a shared skeleton, code poses it (walk, run, attack), and every frame is rendered from the game's camera in 8 directions and turned into pixel art. No generation calls; a full set (4 moves, 8 directions, 240 frames) takes about 40 seconds. It's the spike for making motion cheap enough for a warband a day (`docs/explorations/2026-11-16-warband-art.md`, "From 3D models").

```
tools/sprites-3d/run.sh <work-dir> "Codex 3D=tools/sprites-3d/raider_codex.py" "Meshy 3D=tools/sprites-3d/output/model.glb|--add=tools/sprites-3d/raider_codex.py:blade"
```

That writes, per model, the 4x renders (`<name>/`), the game-size frames (`<name>-px/<move>/<direction>/fNN.png`), and, for all of them beside the PixelLab raider, `still.png` and `walk.gif`, `run.gif`, `attack.gif`. Needs Blender 5.2 (set `BLENDER` if it isn't in the default place) and Python with Pillow and numpy.

- `rig.py`: the skeleton (`JOINTS`), binding, and the moves as code. Facing -Y, `turn(rig, bone, FWD, +a)` swings a limb forward; turns compose in call order, so raise an arm before tilting it. Walk and run sway over the standing foot and turn the shoulders against the hips; the attack is poses on frames (`ATTACK_KEYS`: anticipation, strike, held impact, recovery). Parts named after a bone (`forearm.R_wrap`) ride it rigidly; a one-piece mesh gets nearest-bone weights measured from each bone's surface (Blender's automatic weights fail silently on meshes made of loose pieces).
- `render.py`: loads a model (`.py` that builds named parts, or `.glb`/`.obj`/`.fbx`, which is thinned to about 20k vertices, stood on the ground centred on its feet and scaled to the skeleton's 2 units; `--add=<model.py>:blade` grafts a part from another model), squashes it a little (1.15 wide, 0.92 tall, as sprites are drawn), and renders every frame twice: lit, and flat (each part glowing its own base colour). `--preview` adds big smooth views of the model. `--elev=<deg>` sets the camera height (default 30, the ground's; characters may read better lower, see the exploration).
- `pixelize.py`: each art pixel takes its part's colour from the flat render and one of four tones (dark, shadow, base, light) from the lit one; the darker part at a seam gets a dark line; a dark outline goes round the outside, so parts one or two pixels wide keep their colour.
- `sheet.py`: the comparison images.
- `raider.py`: Claude's hooded raider, built from primitives. `raider_codex.py`: Codex's, written by Codex from `prompts/codex-model.txt` (unedited).
- `prompts/`: the Codex prompts (run with `tools/concept-gen/gen.sh <prompt> <out-dir> prompts/ref-raider32-8x.png prompts/ref-turnaround.jpg`). `input/meshy-front.png` and `meshy-views.png` are Codex's pictures for an image-to-3D tool.

## Image-to-3D models (Meshy)

The first route (round 2, before the Meshy MCP): Codex draws the input (`prompts/meshy-front.txt`), the user makes the model in Meshy (free tier, Image to 3D, front view) and saves the `.glb` in `output/` (gitignored: 26 MB), and our skeleton and code moves pose it. The roster now uses Meshy's rig and clips instead (below); this route stays for creatures Meshy can't rig. It has to face the viewer in its front view (glTF's forward becomes -Y on import).

Its proportions and rest pose won't match the skeleton, so each model gets `<model>.joints.json` beside it, once:

1. `blender --background --python tools/sprites-3d/render.py -- output/model.glb <dir> --joints-view`, then `python tools/sprites-3d/joints.py <dir> raw`: front and side views on a 0.1-unit grid.
2. Read the joints off the grid into `joints` (`.R` bones mirror `.L` ones); bones not given ride along with their parent, so a grafted blade follows the hand. `rest` turns the model's own pose into the skeleton's A-pose (Meshy's arms stick out at about 50 degrees: `["upper_arm.L", "Y", 22]`).
3. Re-run with `rest` and the json (`joints.py <dir> rest output/model.joints.json`) and check the arms hang where the skeleton's do.

`output/model.joints.json` is the hooded raider's.

## Meshy's rig and clips (`--anim`)

The other route skips the joints fit: Meshy rigs the model and animates it from its library, and render.py plays those clips instead of our code moves.

```
blender --background --python tools/sprites-3d/render.py -- output/meshy-rig/clips.glb <dir> [clip[=frames],...] --anim --elev=20 --add=tools/sprites-3d/raider_codex.py:blade
```

- Clips are picked by name (`left_slash`, a substring of `Armature|Left_Slash|baselayer` works); with none, every clip in the file renders at 12 fps. Output folders take the clip's short name, so rename them to `walk`/`run`/`attack` before `sheet.py`.
- `--add` grafts the blade onto the clip rig's `--hand=` bone (default `RightHand`). It is carried between hand frames built from the forearm and the character's forward, so the two rigs' bone roll doesn't matter; `--blade-rot=x,y,z` fine-tunes it.
- Only meshes skinned to the armature are kept: Meshy's rigged GLBs also carry a stray 2 m icosphere.
- `output/meshy-rig/` (gitignored GLBs): the hooded raider remeshed to 30k triangles (`walking.glb`, `running.glb`: Meshy's free walk and run; `clips.glb`: ten library clips). Meshy task ids: remesh `01a1e6d5-ecfc-75a5-ac80-9c63e802f0f8`, rig `01a1e6d7-0edb-7768-bc83-c1645e25f2f9`, clips `01a1e6d7-8177-70df-b8b5-bd124b98a838`.

Costs (Meshy credits, 2026-11-17): rig 5 (walk and run included), library clips 3 each, remesh 5. Meshy rigs at most 380k triangles; the raider was made at 824k on the default model, so it needed the remesh. **Make the next goblins with smart topology** (`meshy_image_to_3d`, `model_type: smart-topology`, `ai_model: meshy-t2.5`, `target_polycount` ~15000, `pose_mode: t-pose`): 15 credits textured instead of 30, riggable as made, no remesh.

## The warband roster, into the game

Five more goblins went through the whole pipeline on 2026-11-17 (the user approved the pictures and a Meshy budget):

1. **Pictures** (Codex, free): `prompts/roster/<slug>.txt` with the 32 px sprite and the hooded raider's picture as references, empty hands; weapons on their own sheet. In `input/roster/`.
2. **Models** (Meshy, 15 each): image-to-3D with smart topology (`meshy-t2.5`, 15k triangles, T-pose, `meshy-n1` texture).
3. **Rigs** (5 each, with a free walk and run) and **clips** (3 each, only what a mechanic uses): raiders three slashes, Lean Forward Sprint and Knock Down; archer Archery Shot; shieldbearer a spear thrust and Shield Push; hooker Crouch Pull and Throw (the grab); chieftain Heavy Hammer Swing; everyone Knock Down. GLBs in `output/<slug>/` (gitignored).
4. **Weapons**: `props.py`, built in a bone's frame and attached with `render.py --prop=props.py:<name>@<Bone>` (knife, bow, spear, shield on `LeftForeArm`, hook, maul). `--height=` scales them with the body.
5. **Render**: `roster.sh <work-dir> [slug ...]`: every clip in 8 directions at 20 degrees, body held in place, pixelized. render.py writes each clip's weapon-hand path (`track.json`, `--track=<Bone>`).
6. **Pack**: `python pack.py <work-dir> [slug ...]` writes `game/content/assets/sprites/<slug>/sheet.png` and `sheet.json`: idle, walk, run, attacks and death per direction. Each attack keeps its clip's own frames at 12 fps, never retimed (smooth swings matter more than telegraphs: the user, 2026-11-17), trimmed to the wind-up's start and the end of the recovery (the last frame that still moves, so a pause after the blow isn't mistaken for the end); `sheet.json`'s `attacks[k].hit` is the contact frame, just after the weapon hand's fastest step, which `art/sprites.ts` plays on the game's hit tick. `ROLES[slug]['tune'][clip]` overrides per clip in clip frames: `hit` where the fastest step isn't the hit (the archer's is the reach for the arrow; its release is frame 39), `cut` a still hold to leave out (never retimed), `first`, `end`.
   - Frame rate: `render.py --fps` (default 12); `roster.sh` renders at 24, so a slowed goblin still shows 12 distinct frames a second (the client plays every clip on the game's clock). `--yaw`, `--release` and `ROLES` `tune` frames stay in 12 fps units and are scaled. `pack.py` keeps at least 1.2 s of clip before each hit (the longest wind-up) and wraps a move longer than the sheet's `cols` into further bands of 8 rows (frame f at column f % cols, row `row + dir + 8 * (f // cols)`), so no sheet passes 4096 px. Frame files run past f99 at 24 fps: sort them by number, not by name.
   - Speed: about 0.18 s a frame (a lit and a flat shot), mostly per-shot setup (the deformed mesh's BVH), not pixels, so a 24 fps roster takes about 40 minutes one goblin after another. Faster, untried: several Blender processes at once, models thinned to about 5k triangles, re-rendering only changed clips, EEVEE or GPU Cycles.
   - Render options for a clip that attacks off its facing or draws a string: `--yaw=<clip>:<deg>[:a:b:c:d]` turns the body for that clip, easing in over frames a..b and out over c..d (the archer's shot turns -90 as the bow comes up, since Meshy's archer stands side-on and shoots out of its left side); `--release=<clip>:<frame>` is when a bow lets go. Props can register per-frame updates (`UPDATES` in `props.py`): the bow's string bends back to the right hand's palm while it's behind the grip and on the arrow line, with an arrow nocked, until the release. A Meshy leaf bone's tail is at an arbitrary length, so place things from its head (the wrist) along its direction, never from its tail. `ROLES` maps clips to moves and holds a colour grade for a texture off the palette (the hooker's came out lime).
7. **Game**: `game/packages/client/src/art/sprites.ts` draws them (on by default; `?sprites=0` for the code rigs).

The chieftain renders at 1.8x a goblin's height on a 96 px frame (`--canvas=96 --height=1.8`); the camera aims at the scaled body's middle.

`python review.py <out-dir>` makes the review images from the packed sheets (all six standing in 8 directions, and walk, run, attack and death GIFs); copy them to `tools/warband-art/img/roster-*`.

7. **Export for live 3D** (what the game draws now): `tools/sprites-3d/export.sh [slug ...]` runs `render.py --export` (`export_game.py`) per character with the same options as the renders (`roster-opts.sh`): the model set up as for a render, its moves' clips as animations named `walk`, `run`, `attack0`.., `death`, thinned to about 5,000 triangles with a 256 px JPEG texture, into `game/content/assets/models/<slug>.glb`, and `<slug>.json` with each attack's first, hit and last time and cut hold (`roles.window`, shared with `pack.py`), the archer's turn and release, and each walk and run clip's stride (how far the ground passes under the planted foot in one loop). About half a minute a character. The client (`art/live3d.ts`) does the squash, the camera and the pixel pass on the GPU. Baked sheets (steps 5 and 6) are now the fallback only.

### Adding a creature (the checklist)

1. Codex picture, T-pose, front view, empty hands (`prompts/roster/<slug>.txt` as the pattern). Run Codex jobs **one or two at a time**: six at once made every image but saved none (they were recovered from `~/.codex/generated_images/`). The user approves the picture before any credits.
2. Meshy, with sign-off on the credits: `meshy_image_to_3d` smart topology (above), then `meshy_rig`, then `meshy_animate` with only the clips a mechanic plays (library ids used so far: Left Slash 97, Right-hand Sword Slash 219, Thrust Slash 240, Lean Forward Sprint 644, Knock Down 187, Archery Shot 224, Shield Push 220, Crouch Pull and Throw 239, Heavy Hammer Swing 128). Download `walking.glb`, `running.glb` and `clips.glb` into `output/<slug>/`.
3. A prop in `props.py` if it holds anything; add the slug's options to `roster.sh` and its clips to `ROLES` in `pack.py`.
4. `roster.sh`, then `pack.py`, then look at the attack rows frame by frame (the strike detection can pick an early frame) and the colours against the band.
5. Map the game's enemy kind to the slug in the client (`art/sprites.ts`, `view.ts`), then from `game/`: `npm run check`, `npm run check:browser`, and a screenshot of a room with enemies (shoot one room per run; three chained shots under one time limit looked like a hang).

Untested: copying owned clips onto a new rig in Blender (every Meshy rig has the same 24 bones), which would make each clip a one-time cost. The roster run bought clips per goblin instead.

### Meshy task ids (to re-download the gitignored GLBs)

| Slug | Model | Rig | Clips |
|---|---|---|---|
| raider-goggles | `01a1e720-4feb-73e6-917b-52e5e8770149` | `01a1e721-459a-725f-8495-e6f0d111db5c` | `01a1e723-0525-71ac-98d4-f41dd092fe3d` |
| archer | `01a1e720-5791-71bf-a069-ed96222124f0` | `01a1e721-661b-7035-8042-44000c153731` | `01a1e723-07d9-7207-a5c0-de19040f3d04` |
| shieldbearer | `01a1e720-5dc7-77d4-8a08-ca48cd550a6f` | `01a1e721-7950-759b-95f6-a1c0be787401` | `01a1e723-09e2-7448-b695-5bc6ad6f88aa` |
| hooker | `01a1e720-6589-77ef-bb6f-59ef63569bb7` | `01a1e721-8666-7439-a4ac-32c2623a0de9` | `01a1e723-0be1-72b7-9299-f66613ebe0bd` |
| chieftain | `01a1e720-6d9b-73cf-8363-dbefe537101f` | `01a1e721-94ad-7048-9783-ccd9d07375a8` | `01a1e723-0e13-7124-8893-23f1811e01d3` |

The hooded raider's are listed above under `--anim`. Credits spent: 40 on the hooded raider, 142 on the five (75 models, 25 rigs, 42 clips).
