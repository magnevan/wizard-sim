# The port to 3D (the game on the kit renderer, the pixel version retired)

Status: active; step 0 built and merged, on review; next: steps 1 and 2 (walk and cast in the court) · Last touched: 2026-11-25
Record: [the plan](../explorations/2026-11-25-port-3d-plan.md) (decisions, height in a 2D sim, steps, the team, risks) · [decision](../decisions/README.md#2026-11-25-the-game-moves-to-the-3d-kit-renderer-the-map-editors-scenes-feed-the-sim-explorations2026-11-25-port-3d-planmd) · [fx spike](../explorations/2026-11-25-fx3d-spike.md) · [The Court in 3D](https://claude.ai/artifact/3dWPYc5ZxZqgrYfpksnegu) (step 0 review, `tools/port-3d-review/`) · [stylised 3D](../explorations/2026-11-23-stylised-3d.md) · [the courtyard on the kit](kit-courtyard.md) · [the map editor](map-editor.md) · [height](height.md)

## Where it stands

`play3d.html` (dev server, and built beside `index.html`) runs the real game in the court in 3D: the sim's room made from the map editor's scene (`tools/kit/room.py`), the kit's scene and lighting, the game camera (`view3d/camera3d.ts`), the live models with no pixel pass (`view3d/bodies.ts`), a dithered hole where a building hides a local wizard (`view3d/fade.ts`), and Fire's spray and floor on the new stateless effects base (`view3d/fx/`). Walking works; the court's mode allows no runes, so casting needs `?shot=fire` for now. No HUD, no help panel. The pixel game is unchanged except that its court is a bare tiered room.

Branch `port-3d` (worktree `.claude/worktrees/port-3d`), not merged to main. Team agents branch off it (`p3d-*`).

## Next

- [ ] **Spell effects, how (agreed with the user 2026-11-25):** four tone pieces here (Fire spray and floor, Arcane beam, Earth rock and impact, Cold nova), each concept → build → the user's verdict; then a spell-look guide from them and a critic calibrated on it; then a dedicated effects thread works through every family in batches, one review page per batch. Stand-ins keep the game playable meanwhile; the swap doesn't wait.
  - [ ] Fire: toon volume without streaks (`fire2`), built and merged (`p3d-fire`; [record](../explorations/2026-11-25-spell-concepts-fire.md)); `fire3` = keep tuning. Tuning toward flame tongues, the core facing north, the floor light, the court shot (`p3d-fire2`).
  - [ ] The other three, picked 2026-11-25 ([record](../explorations/2026-11-25-spell-concepts-tone.md)); the family and draft rules stand. Being built with clips, since the user wants to judge them in motion: the Arcane beam **crisp** ("more elegant"; two impact variants, `p3d-arcane`), the Earth rock **toon** but sized by runes (the painted one is a many-rune size) with a new impact (`p3d-earth`), the Cold ring **crisp**, toned down ("a bit intense", `p3d-cold`).
- No art for the practice ground: it's a temporary space and keeps placeholder dummies (the user, 2026-11-25). Practice dummies and the straw goblin get made with the yard ([opening thread](opening.md)).
- [ ] Later: a profiling pass on the user's machine; an exploration of asset handling (streaming, levels of detail, keeping assets across sessions) rather than squeezing sizes.
- [ ] Agree scene markers (the `marker` object kind, already in `court.scene.json`) and re-running `room.py` on save with the map editor's session.
- [ ] Frame time left (18.8 ms on the user's machine after batching): the shadow pass on heavy Meshy pieces (shadow-only proxies), `FxStage`'s 4× MSAA HDR target (~3 ms), `buildKit` taking 4.4 s of each load. For the profiling pass.
- [ ] Then the swap: `play3d.html` becomes `index.html`, the pixel game moves to `classic.html`.
- [ ] Rollback smoothing for bodies (`Bodies3D` has none; step 3).

## Done

- 2026-11-25 step 2 merged: `p3d-cast` (every spell drawn as its sim shape, `?runes=1`, the 3D VFX Lab `cast3d.html`), `p3d-weight` (the kit batched: 2,616 → 438 draw calls, frame 30.7 → 18.8 ms; art loaded per room; no Pixi on the 3D page). Fire draws as stand-ins until rebuilt.

- 2026-11-25 step 0 reviewed ([decision](../decisions/README.md#2026-11-25-the-ports-step-0-reviewed-a-30-u-camera-the-cut-out-the-models-kept-fire-back-to-concept-art-toolsport-3d-review)): camera 30 u, the cut-out kept, the models kept, both fire looks rejected, the walk grid right. Merged `p3d-hud` (the pixel HUD, bars and edge arrows over the view) and `p3d-practice` (`play3d.html#practice`, key 1: a flat kit sandbox with dummies).

- 2026-11-25 step 0, four agents merged into `port-3d`: `p3d-map` (the court's room from its scene, `marker` objects, a court hash trail), `p3d-bodies` (`art/model-pose.ts` shared posing, `view3d/bodies.ts`), `p3d-fx` (`view3d/fx/`, `fx3d.html`, Fire two ways), `p3d-view` (`play3d.html`, `main3d.ts`, `View3D`, the camera, the fade). The user: bodies keep the pixel game's scale (wizard 2.7 u); the hat hiding the wizard's face at 46° is the intended look.
- 2026-11-25 `GameView` / `ViewCamera` (`client/src/game-view.ts`): the seam the loop, input and panels use; `WorldView` implements it
- 2026-11-25 the plan, from three code sweeps; the user's answers, and what a 2D sim does and doesn't rule out (height, knock-offs, bridges)
