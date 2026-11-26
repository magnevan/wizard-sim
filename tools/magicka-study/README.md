# Magicka study sheets

Scripts that read the installed Magicka 1's effect files, **for study only**: how an effect is built (its emitters, the flipbook cells they play, sizes, life, blend). Nothing they produce goes into the game or this repo. The pictures are written to the gitignored `.reference/magicka-study/` and shown only on the private [Spell Effects Review](https://claude.ai/artifact/Kwh9yrDCTVmnXQRcHQ6vxT). What we learn is written up as notes in `docs/reference/magicka-fire/`.

Magicka 1 is XNA: effects are plain XML (`Content/Effects/**.xml`) and the particle atlases are LZX-compressed `.xnb` 3D textures (`Content/EffectTextures/Particles{A,B,C,D}.xnb`: each slice an 8 × 8 grid of 32 px cells; the slices are a cell's animation frames, A 1, B and C 4, D 8; cells number A 0–63, B 64–127, C 128–191, D 192–255). Magicka 2 packs its data in hashed engine bundles, not opened.

Run without Python's `-I` (Pillow and numpy live in the user's site-packages); the scripts are ours and only read the game's files.

```bash
M="/c/Program Files (x86)/Steam/steamapps/common/Magicka/Content"
python tools/magicka-study/tex.py "$M/EffectTextures/ParticlesD.xnb" out/PD.png zslow   # zslow: the volume's real order
python tools/magicka-study/sheets.py "$M/Effects" <atlas dir> <out dir>                  # one sheet per effect in EFFECTS
python tools/magicka-study/compare.py <our parts sheet> <atlas dir> <out.png>            # our parts beside their cells (ROWS)
```

- `lzx.py`: an LZX decoder for `.xnb` payloads. `tex.py`: a Texture2D or Texture3D `.xnb` to PNG; pass `zslow` for the particle atlases (the default `zfast` scrambles them).
- `sheets.py`: one sheet per effect: a row per emitter with its numbers, the cell's frames, and the particle's life at six moments on our floor colour. Edit `EFFECTS` for another element.
- `compare.py`: our Codex parts sheet beside the Magicka cells doing the same jobs. Edit `ROWS`.
