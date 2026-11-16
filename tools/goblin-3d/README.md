# Goblins from 3D

Goblin sprites from 3D models: a model goes on a shared skeleton, code poses it (walk, run, attack), and every frame is rendered from the game's camera in 8 directions and turned into pixel art. No generation calls; a full set (4 moves, 8 directions, 240 frames) takes about 40 seconds. It's the spike for making motion cheap enough for a warband a day (`docs/explorations/2026-11-16-warband-art.md`, "From 3D models").

```
tools/goblin-3d/run.sh <work-dir> "Claude 3D=tools/goblin-3d/raider.py" "Codex 3D=tools/goblin-3d/raider_codex.py" "Meshy 3D=path/to/meshy.glb"
```

That writes, per model, the 4x renders (`<name>/`), the game-size frames (`<name>-px/<move>/<direction>/fNN.png`), and, for all of them beside the PixelLab raider, `still.png` and `walk.gif`, `run.gif`, `attack.gif`. Needs Blender 5.2 (set `BLENDER` if it isn't in the default place) and Python with Pillow and numpy.

- `rig.py`: the skeleton (`JOINTS`), binding, and the moves as code. Facing -Y, `turn(rig, bone, FWD, +a)` swings a limb forward. Parts named after a bone (`forearm.R_wrap`) ride it rigidly; a one-piece mesh gets nearest-bone weights (Blender's automatic weights fail silently on meshes made of loose pieces).
- `render.py`: loads a model (`.py` that builds named parts, or `.glb`/`.obj`/`.fbx`, which is stood on the ground and scaled to the skeleton's 2 units), squashes it a little (1.15 wide, 0.92 tall, as sprites are drawn), and renders every frame twice: lit, and flat (each part glowing its own base colour). `--preview` adds big smooth views of the model.
- `pixelize.py`: each art pixel takes its part's colour from the flat render and one of four tones (dark, shadow, base, light) from the lit one; the darker part at a seam gets a dark line; a dark outline goes round the outside, so parts one or two pixels wide keep their colour.
- `sheet.py`: the comparison images.
- `raider.py`: Claude's hooded raider, built from primitives. `raider_codex.py`: Codex's, written by Codex from `prompts/codex-model.txt` (unedited).
- `prompts/`: the Codex prompts (run with `tools/concept-gen/gen.sh <prompt> <out-dir> prompts/ref-raider32-8x.png prompts/ref-turnaround.jpg`). `input/meshy-front.png` and `meshy-views.png` are Codex's pictures for an image-to-3D tool.

A model from an image-to-3D tool must face the viewer in its front view (glTF's forward becomes -Y on import). Its proportions should be near the skeleton's (a big head, short legs); otherwise the joints in `JOINTS` need fitting to it.
