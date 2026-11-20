# Sprites from 3D

**Now (2026-11-17):** the game draws the warband and the wizard live from their 3D models (`export.sh`, step 7 of [the roster](#the-warband-roster-into-the-game); `game/packages/client/src/art/live3d.ts`). The baked sheets below are the fallback only (`?live3d=0`, or a software renderer). Check an export in the Model Viewer (`/models.html` on the game's dev server; Vite reloads it when a model changes).

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

The first route (round 2, before the Meshy MCP): Codex draws the input (`prompts/meshy-front.txt`), the user makes the model in Meshy (free tier, Image to 3D, front view) and saves the `.glb` in `output/` (26 MB; that first model is no longer on disk, only the roster's downloads are kept), and our skeleton and code moves pose it. The roster now uses Meshy's rig and clips instead (below); this route stays for creatures Meshy can't rig. It has to face the viewer in its front view (glTF's forward becomes -Y on import).

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
- `output/meshy-rig/` (committed GLBs): the hooded raider remeshed to 30k triangles (`walking.glb`, `running.glb`: Meshy's free walk and run; `clips.glb`: ten library clips). Meshy task ids: remesh `01a1e6d5-ecfc-75a5-ac80-9c63e802f0f8`, rig `01a1e6d7-0edb-7768-bc83-c1645e25f2f9`, clips `01a1e6d7-8177-70df-b8b5-bd124b98a838`.

Costs (Meshy credits, 2026-11-17): rig 5 (walk and run included), library clips 3 each, remesh 5. Meshy rigs at most 380k triangles; the raider was made at 824k on the default model, so it needed the remesh. **Make the next goblins with smart topology** (`meshy_image_to_3d`, `model_type: smart-topology`, `ai_model: meshy-t2.5`, `target_polycount` ~15000, `pose_mode: t-pose`): 15 credits textured instead of 30, riggable as made, no remesh.

## The warband roster, into the game

Five more goblins went through the whole pipeline on 2026-11-17 (the user approved the pictures and a Meshy budget):

1. **Pictures** (Codex, free): `prompts/roster/<slug>.txt` with the 32 px sprite and the hooded raider's picture as references, empty hands; weapons on their own sheet. In `input/roster/`.
2. **Models** (Meshy, 15 each): image-to-3D with smart topology (`meshy-t2.5`, 15k triangles, T-pose, `meshy-n1` texture).
3. **Rigs** (5 each, with a free walk and run) and **clips** (3 each, only what a mechanic uses): raiders three slashes, Lean Forward Sprint and Knock Down; archer Archery Shot; shieldbearer a spear thrust and Shield Push; hooker Crouch Pull and Throw (the grab); chieftain Heavy Hammer Swing; everyone Knock Down. GLBs in `output/<slug>/` (committed).
4. **Weapons**: `props.py`, built in a bone's frame and attached with `render.py --prop=props.py:<name>@<Bone>` (knife, bow, spear, shield on `LeftForeArm`, hook, maul). The wizard's conjured weapons and guards are in `wizprops.py`, which reuses `props.py`'s helpers (weapons on `RightHand`, long ones soft as `~0.25`; guards on `LeftForeArm`); `render.py ... --frames=0` renders just one frame of each move for a quick look, and `arms-sheet.py` lays those out. `--height=` scales them with the body. Each prop (and a grafted `--add` part) hangs from one empty, `<name> carrier`, at the palm; the export lists them (`props`), and the game drops one held in a hand when its holder dies. Check how a prop sits before exporting: `render.py ... --inspect=<n>` renders n smooth stills a clip from the south and the east (Workbench, the soft staff turned as the game turns it) into `<out>/inspect/`, and `python montage.py <out>/inspect <sheet.png>` lays them out.
5. **Render**: `roster.sh <work-dir> [slug ...]`: every clip in 8 directions at 20 degrees, body held in place, pixelized. render.py writes each clip's weapon-hand path (`track.json`, `--track=<Bone>`).
6. **Pack**: `python pack.py <work-dir> [slug ...]` writes `game/content/assets/sprites/<slug>/sheet.png` and `sheet.json`: idle, walk, run, attacks and death per direction. Each attack keeps its clip's own frames at 12 fps, never retimed (smooth swings matter more than telegraphs: the user, 2026-11-17), trimmed to the wind-up's start and the end of the recovery (the last frame that still moves, so a pause after the blow isn't mistaken for the end); `sheet.json`'s `attacks[k].hit` is the contact frame, just after the weapon hand's fastest step, which `art/sprites.ts` plays on the game's hit tick. `ROLES[slug]['tune'][clip]` overrides per clip in clip frames: `hit` where the fastest step isn't the hit (the archer's is the reach for the arrow; its release is frame 39), `cut` a still hold to leave out (never retimed), `first`, `end`.
   - Frame rate: `render.py --fps` (default 12); `roster.sh` renders at 24, so a slowed goblin still shows 12 distinct frames a second (the client plays every clip on the game's clock). `--yaw`, `--release` and `ROLES` `tune` frames stay in 12 fps units and are scaled. `pack.py` keeps at least 1.2 s of clip before each hit (the longest wind-up) and wraps a move longer than the sheet's `cols` into further bands of 8 rows (frame f at column f % cols, row `row + dir + 8 * (f // cols)`), so no sheet passes 4096 px. Frame files run past f99 at 24 fps: sort them by number, not by name.
   - Speed: about 0.18 s a frame (a lit and a flat shot), mostly per-shot setup (the deformed mesh's BVH), not pixels, so a 24 fps roster takes about 40 minutes one goblin after another. Faster, untried: several Blender processes at once, models thinned to about 5k triangles, re-rendering only changed clips, EEVEE or GPU Cycles.
   - Render options for a clip that attacks off its facing or draws a string: `--yaw=<clip>:<deg>[:a:b:c:d]` turns the body for that clip, easing in over frames a..b and out over c..d (the archer's shot turns -90 as the bow comes up, since Meshy's archer stands side-on and shoots out of its left side); `--release=<clip>:<frame>` is when a bow lets go. Props can register per-frame updates (`UPDATES` in `props.py`): the bow's string bends back to the right hand's palm while it's behind the grip and on the arrow line, with an arrow nocked, until the release. A Meshy leaf bone's tail is at an arbitrary length, so place things from its head (the wrist) along its direction, never from its tail. `ROLES` maps clips to moves and holds a colour grade for a texture off the palette (the hooker's came out lime).
7. **Export for live 3D** (what the game draws now): `tools/sprites-3d/export.sh [slug ...]` runs `render.py --export` (`export_game.py`) per character with the same options as the renders (`roster-opts.sh`): the model set up as for a render, its moves' clips as animations named `walk`, `run`, `attack0`.., `death`, thinned to about 5,000 triangles with a 1024 px JPEG texture (each atlas island padded 16 px first: unpadded and cut to 256 px, the black between Meshy's islands showed as cracks in the Model Viewer), into `game/content/assets/models/<slug>.glb`, and `<slug>.json` with each attack's first, hit and last time and cut hold (`roles.window`, shared with `pack.py`), the archer's turn and release, and each walk and run clip's stride (how far the ground passes under the planted foot in one loop). Also the wizard's spell moves (`casts` with their release, `loops`) and a soft prop's carrier with an axis marker (the staff, turned back toward upright by the client as `render.py` does), and the standing height. Each prop is listed by name (`props`); the wizard's export also takes every conjured weapon and guard from `wizprops.py` (`roster-opts.sh` `WIZ_ARMS`) and `--show=staff`, so the game shows the staff by default and swaps in the prop the seat holds (the whip's mesh lash is left out: the game draws it). Spaces in Blender names come out as underscores in three.js (`PropertyBinding.sanitizeNodeName`). About half a minute a character. The client (`art/live3d.ts`) does the squash, the camera and the pixel pass on the GPU. Baked sheets (steps 5 and 6) are now the fallback only.
8. **Game**: `game/packages/client/src/art/live3d.ts` draws each body with a model live; `art/sprites.ts` maps enemy kinds to slugs, picks the move and clip time from the rig state, and falls back to the baked sheet (on by default; `?live3d=0` for the sheets, `?sprites=0` for the code rigs).

Shared files: `roles.py` holds `ROLES` (each character's clip per move, attack `tune`, colour `grade`) and the attack window search, for both `pack.py` and `export_game.py`; `roster-opts.sh` holds each slug's render options (props, size, `--yaw`, `--release`) and its output folder, for both `roster.sh` and `export.sh`. Change a character there once.

The chieftain renders at 1.8x a goblin's height on a 96 px frame (`--canvas=96 --height=1.8`); the camera aims at the scaled body's middle.

`python review.py <out-dir>` makes the review images from the packed sheets (all six standing in 8 directions, and walk, run, attack and death GIFs); copy them to `tools/warband-art/img/roster-*`.

### Adding a creature (the checklist)

1. Codex picture, T-pose, front view, empty hands (`prompts/roster/<slug>.txt` as the pattern). Run Codex jobs **one or two at a time**: six at once made every image but saved none (they were recovered from `~/.codex/generated_images/`). The user approves the picture before any credits.
2. Meshy, with sign-off on the credits: `meshy_image_to_3d` smart topology (above), then `meshy_rig`, then `meshy_animate` with only the clips a mechanic plays (library ids used so far: Left Slash 97, Right-hand Sword Slash 219, Thrust Slash 240, Lean Forward Sprint 644, Knock Down 187, Archery Shot 224, Shield Push 220, Crouch Pull and Throw 239, Heavy Hammer Swing 128). Download `walking.glb`, `running.glb` and `clips.glb` into `output/<slug>/`.
3. A prop in `props.py` if it holds anything (`~k` after the name makes it soft, as the wizard's staff); add the slug's options and folder to `roster-opts.sh` (and `ROSTER`) and its clips to `ROLES` in `roles.py`.
4. `roster.sh`, then `pack.py`, for the fallback sheet; look at the attack rows frame by frame (the strike detection can pick an early frame) and the colours against the band.
5. `export.sh <slug>` for the live model (`game/content/assets/models/`).
6. Map the game's enemy kind to the slug in the client (`art/sprites.ts`, `view.ts`), then from `game/`: `npm run check`, `npm run check:browser`, and look at it live in the dev server on a real GPU (headless checks get the baked sheets). For a screenshot of a room with enemies, shoot one room per run; three chained shots under one time limit looked like a hang.

Untested: copying owned clips onto a new rig in Blender (every Meshy rig has the same 24 bones), which would make each clip a one-time cost. The roster run bought clips per goblin instead.

### Meshy task ids

The downloads themselves are committed in `output/<slug>/` (`output/meshy-rig/` for the hooded raider): they were gitignored until 2026-11-17, were lost with a worktree, and had to be fetched again from these tasks (the user: keep them in git so they can't be lost again). A task's file links expire, so re-download through the Meshy MCP (`meshy_get_task_status` gives fresh ones).

| Slug | Model | Rig | Clips |
|---|---|---|---|
| raider-goggles | `01a1e720-4feb-73e6-917b-52e5e8770149` | `01a1e721-459a-725f-8495-e6f0d111db5c` | `01a1e723-0525-71ac-98d4-f41dd092fe3d` |
| archer | `01a1e720-5791-71bf-a069-ed96222124f0` | `01a1e721-661b-7035-8042-44000c153731` | `01a1e723-07d9-7207-a5c0-de19040f3d04` |
| shieldbearer | `01a1e720-5dc7-77d4-8a08-ca48cd550a6f` | `01a1e721-7950-759b-95f6-a1c0be787401` | `01a1e723-09e2-7448-b695-5bc6ad6f88aa` |
| hooker | `01a1e720-6589-77ef-bb6f-59ef63569bb7` | `01a1e721-8666-7439-a4ac-32c2623a0de9` | `01a1e723-0be1-72b7-9299-f66613ebe0bd` |
| chieftain | `01a1e720-6d9b-73cf-8363-dbefe537101f` | `01a1e721-94ad-7048-9783-ccd9d07375a8` | `01a1e723-0e13-7124-8893-23f1811e01d3` |
| wizard | `01a1e8a6-014d-71db-a48f-3a79516f85a1` | `01a1e8a6-cef9-7556-8eb0-2a3fa41b20c8` | `01a1e8a7-508f-7681-9bf5-acf5a21a970d` |

The hooded raider's are listed above under `--anim`. Credits spent: 40 on the hooded raider, 142 on the five (75 models, 25 rigs, 42 clips).

## The wizard

The players' wizard went through the same pipeline on 2026-11-17, because the code rig drawn 1.7x (the default then; 1.4 now) (`rigs.ts` `WIZ_Z`) read as flat slabs beside the goblins. The design is the code rig's, unchanged: `prompts/roster/wizard.txt` gives Codex the game's wizard sprites and the hooded raider's 3D picture, and asks for the same wizard in the goblins' finish (`input/roster/wizard.png`, approved by the user). Meshy: 38 credits (model 15, rig 5, six clips 18): Mage Spell Cast 8 (137, hands raised: gathering), Mage Spell Cast 3 (132, two-handed push: Force casts), Charged Ground Slam (127, Area), Mage Spell Cast (129, Self), Right-hand Sword Slash (219, the staff's shove and weapon Strikes), Knock Down (187).

- **Size:** `--height=1.28 --canvas=64` (`roster-opts.sh`): 1.4x the old code wizard, the user's size after 1.7 looked too big. The committed baked sheet is still the first bake at `--height=1.55` (about 49 px, for 1.7x); the user doesn't want it re-made, as it's only the fallback.
- **The staff** is `props.py` `staff`, held as `staff~0.1@RightHand --firm=sword_slash`: through the fist as a sword's grip (out of the thumb side), and *soft*. A rigid one takes every wrist tilt of the walk; `~k` makes render.py (`soft_props`) turn its main axis (`PROP_AXIS`) back toward upright each frame about the palm, keeping k of the hand's tilt. `--firm=<clip,...>` names clips where it's held firmly instead (the staff's blow, so it swings with the hand); the export lists them per soft prop (`soft[].firm`) and the client eases between the two.
- **Bulwark remade (2026-11-19):** `output/guards-r3/bulwark.glb` is now a smart-topology model (the first, with a base plate and a shattered texture, is `bulwark-r3.glb`); `wizprops.py` `meshy(..., thin=)` flattens a core's depth (Leaf and Spike use 0.55). Re-export with `export.sh wizard`.
- **Guard clips (2026-11-18):** `output/wizard/guard-block.glb` and `guard-brace.glb`, Meshy text-to-motion put on the wizard's rig (26 credits; the library's Block1, Block10 and Shield Push Left are in `blocks.glb`, unused: they raise the guard under the hat brim). Each file's clip was renamed from Meshy's `retarget_clip` so they don't collide. `export.sh` adds every `guard-*.glb`; `roles.py` names them `block` and `brace`.
- **Moves:** `pack.py` `ROLES['wizard']` adds `casts` (one-shots trimmed and given a release frame like an attack's hit: `cast`, `area`, `self`) and `loops` (`gather`, the whole clip). `sheet.json` lists them under `casts`.
- **Seats:** one red sheet; `art/sprites.ts` `seatSheet` recolours it for each seat from `px.ts` `TEAMS` when it loads (robe and hat keyed by crimson hue, trim by gold), so the seat colours keep one home.
- **In the game:** drawn live (`art/live3d.ts`; the seat recolour and the staff's upright turn are done on the GPU there), on with the warband's sprites, `?wizsprite=0` for the code rig; the detailed drawing (hd) stays code. Self, Area and the staff blow play their clips; spells start at the live staff's tip. Not yet: a conjured weapon doesn't replace the staff (a follow-up, in the exploration). The baked fallback sheet doesn't play Area or Self.

