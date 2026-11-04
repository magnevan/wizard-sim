# Spell Wishlist Gallery

A page of animated spell scenes for rating spell ideas: ★ keep, ? maybe, ✗ cut, plus a note.
Published at https://claude.ai/artifact/5GLNfuBM3npBdMBLefATSQ (private to the user).

## Files
- `engine.js`: the drawing kit `g` and `SG.register`. Every vignette is a **pure function of time**, `draw(g, t)`, so loops are seamless and frames are reproducible.
- `vignettes/*.js`: one file per batch, each calling `SG.register({...})`. They're loaded in the order `index.html` lists them.
- `app.js`: cards, filters, the animation loop, and ratings.
- `filmstrip.html` + `shoot.sh`: render a vignette file's frames to a PNG with headless Chrome, to review scenes without a browser:
  `bash tools/spell-gallery/shoot.sh vignettes/<file>.js "<windows path>\strip.png" 6 [id]` (set `HEIGHT=` for more rows, about 215px each).

## Adding spells
Add a new `vignettes/<batch>.js`, list it in `index.html`, check it with `shoot.sh`, then republish `index.html` with the files list (use `root` = this folder). `status` is one of `starred | maybe | user | new`. `family` is one of `offense | control | preparation | support | enchant | weapon | summon | movement`.

## Reading ratings
Ratings live in the artifact's db: collection `ratings`, one doc per spell id, `{ mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }`. Read them with `ArtifactData` `list` on collection `ratings`, then fold them into `docs/ideas/spell-wishlist.md`.

## Engine helpers worth promoting
The builder agents wrote these locally in several files: lob/toss arc with a ground shadow, telegraph danger circle, countdown/progress ring, screen shake, scorch mark, ghost wizard, sigil on an actor, ally HP bar, walk/ease between points.
