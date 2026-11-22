# Wizard weapons and their motion

Status: active · Last touched: 2026-11-21 at 3675fb0
Record: [weapon motion flow](../explorations/2026-11-20-weapon-motion-flow.md) ("As built", then the rounds) · [warband art](../explorations/2026-11-16-warband-art.md) ("The Model Viewer", "Animation fixes from the viewer")

## Where it stands

The wizard's weapons are conjurations built in Blender (`tools/sprites-3d/wizprops.py`) and held by the live 3D wizard. The weapon-concepts, weapon-fixes, model-viewer, anim-fixes and wizard-arms branches are all merged into main. Done so far: blended transitions, the jab, the trident, the bow, and the maul's combo with keyed swing arcs. The maul's latest round (keyed arcs, 3675fb0) is waiting for the user's look.

## Next

- [ ] The user's verdict on the maul's swing. Still open: between quick Strikes the recovery leaves the maul head low by the feet.
- [ ] Movesets for the sword, the whip and the focus.
- [ ] The user reviews every weapon.
- [ ] Guards read big and hang at the side. There's no blocking pose yet.

Known issues to file or fix: a phantom trident (paused until the user has a cleaner repro); the staff appears mid-lunge when a blow spends the last use.

## How to work here

- Check every bought clip with `game/scripts/clip-paths.mjs` before wiring it in.
- Then look at the viewer's ▶ sequences from the side (`scripts/viewer-shots.mjs`, `view=pix`) and one game screenshot (`game/scripts/blow-film.mjs --weapon --move strike|heavy|sweep|block`).
- The wizard's Meshy rig task, for `meshy_animate` on new clips: `01a1e8a6-cef9-7556-8eb0-2a3fa41b20c8`.
- The user flags motion that obviously feels wrong and doesn't want it overthought.

## Done

- 2026-11-17 Model Viewer (`/models.html`), the Stage tools (`?stage=1`), the viewer's animation fixes, the conjured props in game
- 2026-11-20 Blended transitions, the jab moveset, the press buffer and cancel window
- 2026-11-21 Trident, bow, two-handers, the maul's smash and combo (336e8b4, 7ea008b, 3675fb0)
- 2026-11-22 The Ice bow's Heavy is a lance, one big icicle piercing its line (#8; [ice rework](../explorations/2026-11-22-ice-rework.md))
