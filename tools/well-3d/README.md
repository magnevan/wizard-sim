# The battery well's rings, from 3D

The bought rings couldn't move: PixelLab's animations morphed them (2026-11-12). These scripts rebuild them in Blender, so they spin, fall and rise as solid things, then snap them back to the bought rings' colours. No generation calls. The game paints the well from these and the bought drum and crystal (`game/packages/client/src/art/well-anim.ts`).

## Making the game's assets

```
python tools/well-3d/fit_rings.py                                     # radius, band width, tilt fitted to the bought silhouette -> rings-fit.json
python tools/well-3d/drum_fill.py                                     # the drum (lit and drained) without the bought rings' last rows
blender --background --python tools/well-3d/rings.py -- <spin> spin A # the steady spin: a whole turn, 240 frames, a column apart
blender --background --python tools/well-3d/rings.py -- <fall> fall A # the power-down: a rigid-body fall, 60 frames
python tools/well-3d/export.py <spin> <fall>                          # -> game/content/assets/well/rings3d/
```

About 16 minutes for the spin, two for the fall. The spin is exported as a grid, 16 cells to a row.

- **The rings:** two solid bands with sharp corners, ring A (bottom left to top right) a band's thickness bigger, so they never meet. Each turns about its own axis, A one way, B the other, with a slight wobble (`WOBBLE`, a whole number of swings a turn so the loop is seamless; the user, 2026-11-13).
- **The light:** a key light from about the camera, a warm crystal light toward the camera, and a world that is warm above and dark below for the metal to reflect.
- **The 'where' render:** each frame has one, recording for each pixel which face of which band it is and where on that face (u round the ring, v across). `pixelize.py` uses it to draw the band's face pixel by pixel.
- **The spin:** split at the crystal (back rings, crystal, front rings).
- **The camera** fits its scale to the width (`sensor_fit`): left to Blender, the fall's canvas, taller than wide, came out 121/104 too big, and the repair showed a gap over the crystal (the user, 2026-11-13).
- **The fall:** its first frames, before the rings let go, are the spin's own poses four frames apart (`SPIN_STEP`, wobble and all), so the repair, playing the fall back, hands over to the spin with no snap. Stand-ins for the drum, the crystal and the steps, fitted to the art, are both what the rings land on and holdouts, so a ring behind the drum is cut where the art covers it. The rings ignore each other, since they sit closer than the collision margin.

## Snapping to pixel art (`pixelize.py`)

- **Shades:** the ring's pixels are ranked by brightness and take the bought rings' browns in the bought rings' own proportions.
- **The band face**, drawn per art pixel:
  - a raised border just inside each edge, found on screen so every face keeps one;
  - a dark channel in the bought rings' deepest brown;
  - raised strips across it every 4 columns, stopping a pixel short of the borders.

  This is the user's design after rune patterns didn't read (2026-11-13). The rune and streak versions are still in the file, unused.
- **Wear** (`WEAR`): ribs missing or snapped short, slanting scratches, chips out of the borders, a few patina spots, dents on the insides. Placed once round the whole turn, so they ride with the ring: with even ribs alone the spin read as text scrolling on a display (the user).
- **Hidden lines** (`unhide`, the fall only): Blender draws a ring's outline even where a stand-in (crystal, drum, steps) hides the ring, so a line pixel with no ring metal beside it is cleared.
- **Headroom:** the renders have `TOP` (8) spare rows above the layers' crop, since the 3D rings reach a little higher than the bought ones; rings3d.json records it and the game draws the strips that much higher.
- **Inside faces:** stepped by distance from the crystal.
- **Glint:** the yellow line on the crystal-facing edges, two deep (tan inside the yellow), drawn after snapping, since no render can make it.
- **Dark copies:** each ladder brown three steps down, for the dead well.

## Looking at it

- `compare.py`: bought and 3D side by side.
- `preview_gif.py`: bought, the steady spin, the fast spin.
- `swatch.py`: the band's pattern laid flat.
- `straighten.py`: the bought front bands sheared level, pixel for pixel.
- `unwrap.py`: a rough map of the bought engraving through the fit.
- `game/scripts/well-frames.mjs` paints each state directly. In the game, `?at=well-failing#battery` (or `?fail=1#battery`) reaches the overload's end and the fall in seconds, and `?fail=2#battery` the repair (game/README.md).
