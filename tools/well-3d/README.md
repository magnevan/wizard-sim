# The battery well's rings, from 3D

The bought rings can't move well: PixelLab's animations morphed them (2026-11-12). These scripts rebuild them in Blender so they spin (and later fall and rise) as solid things, then snap them back to the bought rings' colours. No generation calls.

```
python tools/well-3d/fit_rings.py                 # fits radius, band width and tilt to the bought silhouette -> rings-fit.json
python tools/well-3d/band_texture.py              # the engraved band (the game's bought runes, carved) -> build/
blender --background --python tools/well-3d/rings.py -- <renders_dir> spin|test
python tools/well-3d/pixelize.py <renders_dir> <out_dir>      # back.png, front.png strips, rings.json
python tools/well-3d/compare.py <out_dir> <out.png> [frame]    # bought vs 3D, side by side
python tools/well-3d/preview_gif.py <out_dir> <out.gif>        # bought | steady spin | fast spin
```

Each frame is rendered twice, split at the crystal's depth, so the game draws back rings, crystal, front rings. The spin turns each ring about its own axis (A one way, B the other); the band's pattern repeats four times round, so one loop is a quarter turn, one frame per art pixel of travel at the rim.
