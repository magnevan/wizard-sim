# 02: real-time 3D goblins through a pixel shader

**Answered (2026-11-17): yes.** The user, on this prototype: "The 3D version is much better, and it's going to be the more
flexible approach. Let's do this for all the characters." The game now draws the goblin warband and the wizard this
way (`game/packages/client/src/art/live3d.ts`, models from `tools/sprites-3d/export.sh`, thinned to about 5,000
triangles); the baked sheets are its fallback. See "Live 3D in the game" in the exploration and the decision
[Characters are drawn live from their 3D models](../../docs/decisions/README.md#2026-11-17-characters-are-drawn-live-from-their-3d-models-the-wizard-at-14x-explorations2026-11-16-warband-artmd).

## Question

Does the hooded raider drawn live from its 3D model, through a shader that copies the baked pixel pass, look as good as
its baked sprite while it walks, turns and is slowed, and how many fit in a frame?

Why ask: baked sheets are sampled at a fixed rate (12, now 24 fps), so a slowed goblin (chilled) shows fewer frames a
second and gets choppy; they also turn in 8 steps. A live model has neither limit, and needs no sheets at all. The risks
are the look (pixel shimmer as a model turns or moves less than a pixel) and the cost. See
`docs/explorations/2026-11-16-warband-art.md` ("Slow goblins: 24 fps sheets and a real-time 3D test").

## Run

```
npm install
npm run dev        # http://localhost:5191: left half live 3D, right half the baked sheet, in step
npm run bench -- --gpu                 # frames a second at 12 to 200 goblins, live 3D on and off, on this GPU
npm run bench -- --gpu --shots <dir>   # also screenshots of each move
```

It needs the raider's Meshy rig, which is gitignored: `tools/sprites-3d/output/meshy-rig/clips.glb` and `walking.glb`
(the task ids to download them again are in `tools/sprites-3d/README.md`). The baked side reads
`game/content/assets/sprites/raider-hooded/sheet.png`.

Controls: the move (walk in a circle, attack in 16 facings, walk in place turning), speed (0.05 to 1: slow motion for
both sides), count, pixel snap for the live side, and the live side on or off. URL parameters do the same (`mode`,
`speed`, `n`, `snap=0`, `live=0`), plus `t` to hold the clock and `debug=rank` to show each live goblin's depth rank.

How the live side is drawn (`src/main.ts`), copying `tools/sprites-3d` so the comparison is fair: the render's camera
(orthographic, 20 degrees up, 16 px a unit), its squash (1.15 wide, 0.92 tall) and light (upper left, toward the
viewer); then `pixelize.py`'s rules on the GPU, in its order. The scene renders at 4x into two half-float layers, like the
baked render's two shots: each part's flat colour (with the goblin's depth rank in alpha) and the light ratio. Each
art pixel takes the commonest part of its 4x4 block (if half the block is covered) and that part's mean colour and
light; then the light is banded into four tones (shadows lean blue, lights warm, the same thresholds), the darker side
of a meeting between two parts takes its dark tone (the one-pixel seams), and an ink outline goes outside each goblin
and over whoever stands behind it. The blade is a plain box on the right hand, a stand-in for the grafted Codex
blade.

## Findings

- **Cost (2026-11-17, AMD Radeon 780M, an integrated laptop GPU, D3D11, headless Chrome):** 12, 50 and 100 live goblins
  all hold the frame cap (about 57 fps headless). 200 drop to 49 to 54 fps: the CPU work of posing the skeletons
  (`AnimationMixer`, about 0.09 ms a goblin) reaches 19 ms a frame, while the GPU keeps up with 6.2 million triangles.
  The Meshy model is about 31,000 triangles a goblin, far more than 32 px needs: thinning it would help weaker GPUs, but
  the CPU cost is per bone, not per triangle. In software (SwiftShader) live 3D runs at 10 to 14 fps against 44 with
  sprites only: a floor, not a real machine.
- **Look:** to judge by the user, moving, in the dev page or the GIFs on the Goblin Warband Art page. The first pass
  outlined only each silhouette; the user saw the baked frames line every edge between parts. The pass was rebuilt in
  `pixelize.py`'s order (part first, then tone and seams), and on stills the live goblins now read close to the baked
  ones: the same goblin at the same size, seams between hood, face, sack and arms, outlines between goblins.
- **Outcome:** the user judged the look moving and chose live 3D for every character (above).
