# Goblins from 3D

Goblin sprites from 3D models: a model goes on a shared skeleton, code poses it (walk, run, attack), and every frame is rendered from the game's camera in 8 directions and turned into pixel art. No generation calls; a full set (4 moves, 8 directions, 240 frames) takes about 40 seconds. It's the spike for making motion cheap enough for a warband a day (`docs/explorations/2026-11-16-warband-art.md`, "From 3D models").

```
tools/goblin-3d/run.sh <work-dir> "Codex 3D=tools/goblin-3d/raider_codex.py" "Meshy 3D=tools/goblin-3d/output/model.glb|--add=tools/goblin-3d/raider_codex.py:blade"
```

That writes, per model, the 4x renders (`<name>/`), the game-size frames (`<name>-px/<move>/<direction>/fNN.png`), and, for all of them beside the PixelLab raider, `still.png` and `walk.gif`, `run.gif`, `attack.gif`. Needs Blender 5.2 (set `BLENDER` if it isn't in the default place) and Python with Pillow and numpy.

- `rig.py`: the skeleton (`JOINTS`), binding, and the moves as code. Facing -Y, `turn(rig, bone, FWD, +a)` swings a limb forward; turns compose in call order, so raise an arm before tilting it. Walk and run sway over the standing foot and turn the shoulders against the hips; the attack is poses on frames (`ATTACK_KEYS`: anticipation, strike, held impact, recovery). Parts named after a bone (`forearm.R_wrap`) ride it rigidly; a one-piece mesh gets nearest-bone weights measured from each bone's surface (Blender's automatic weights fail silently on meshes made of loose pieces).
- `render.py`: loads a model (`.py` that builds named parts, or `.glb`/`.obj`/`.fbx`, which is thinned to about 20k vertices, stood on the ground centred on its feet and scaled to the skeleton's 2 units; `--add=<model.py>:blade` grafts a part from another model), squashes it a little (1.15 wide, 0.92 tall, as sprites are drawn), and renders every frame twice: lit, and flat (each part glowing its own base colour). `--preview` adds big smooth views of the model. `--elev=<deg>` sets the camera height (default 30, the ground's; characters may read better lower, see the exploration).
- `pixelize.py`: each art pixel takes its part's colour from the flat render and one of four tones (dark, shadow, base, light) from the lit one; the darker part at a seam gets a dark line; a dark outline goes round the outside, so parts one or two pixels wide keep their colour.
- `sheet.py`: the comparison images.
- `raider.py`: Claude's hooded raider, built from primitives. `raider_codex.py`: Codex's, written by Codex from `prompts/codex-model.txt` (unedited).
- `prompts/`: the Codex prompts (run with `tools/concept-gen/gen.sh <prompt> <out-dir> prompts/ref-raider32-8x.png prompts/ref-turnaround.jpg`). `input/meshy-front.png` and `meshy-views.png` are Codex's pictures for an image-to-3D tool.

## Image-to-3D models (Meshy)

Codex draws the input (`prompts/meshy-front.txt`), the user makes the model in Meshy (free tier, Image to 3D, front view) and saves the `.glb` in `output/` (gitignored: 26 MB). Meshy's own rig and animations aren't used. It has to face the viewer in its front view (glTF's forward becomes -Y on import).

Its proportions and rest pose won't match the skeleton, so each model gets `<model>.joints.json` beside it, once:

1. `blender --background --python tools/goblin-3d/render.py -- output/model.glb <dir> --joints-view`, then `python tools/goblin-3d/joints.py <dir> raw`: front and side views on a 0.1-unit grid.
2. Read the joints off the grid into `joints` (`.R` bones mirror `.L` ones); bones not given ride along with their parent, so a grafted blade follows the hand. `rest` turns the model's own pose into the skeleton's A-pose (Meshy's arms stick out at about 50 degrees: `["upper_arm.L", "Y", 22]`).
3. Re-run with `rest` and the json (`joints.py <dir> rest output/model.joints.json`) and check the arms hang where the skeleton's do.

`output/model.joints.json` is the hooded raider's.
