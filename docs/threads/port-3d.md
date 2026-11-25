# The port to 3D (the game on the kit renderer, the pixel version retired)

Status: active; step 0 built and merged, on review; next: steps 1 and 2 (walk and cast in the court) · Last touched: 2026-11-25
Record: [the plan](../explorations/2026-11-25-port-3d-plan.md) (decisions, height in a 2D sim, steps, the team, risks) · [decision](../decisions/README.md#2026-11-25-the-game-moves-to-the-3d-kit-renderer-the-map-editors-scenes-feed-the-sim-explorations2026-11-25-port-3d-planmd) · [fx spike](../explorations/2026-11-25-fx3d-spike.md) · [The Court in 3D](https://claude.ai/artifact/3dWPYc5ZxZqgrYfpksnegu) (step 0 review, `tools/port-3d-review/`) · [stylised 3D](../explorations/2026-11-23-stylised-3d.md) · [the courtyard on the kit](kit-courtyard.md) · [the map editor](map-editor.md) · [height](height.md)

## Where it stands

`play3d.html` (dev server, and built beside `index.html`) runs the real game in the court in 3D: the sim's room made from the map editor's scene (`tools/kit/room.py`), the kit's scene and lighting, the game camera (`view3d/camera3d.ts`), the live models with no pixel pass (`view3d/bodies.ts`), a dithered hole where a building hides a local wizard (`view3d/fade.ts`), and Fire's spray and floor on the new stateless effects base (`view3d/fx/`). Walking works; the court's mode allows no runes, so casting needs `?shot=fire` for now. No HUD, no help panel. The pixel game is unchanged except that its court is a bare tiered room.

Branch `port-3d` (worktree `.claude/worktrees/port-3d`), not merged to main. Team agents branch off it (`p3d-*`).

## Next

- [ ] The user's answers on The Court in 3D (camera distance, the hole, the models, fire A or B, the walk grid).
- [ ] Agree scene markers (the `marker` object kind, already in `court.scene.json`) and re-running `room.py` on save with the map editor's session.
- [ ] Step 2: the HUD on a 2D canvas over the view; every spell drawn as its sim hit shape; the practice ground (a flat kit scene with dummies, replacing the Sanctum's role); casting in the court behind a dev switch; the 3D VFX Lab.
- [ ] Weight before the swap: trim `kit-render.ts`'s eager texture glob (dist grew 40 → 217 MB; 104 MB first load), batch the kit (2,565 draw calls), load only the room's models; `play3d` shouldn't pull the Pixi chunk.
- [ ] Then the swap: `play3d.html` becomes `index.html`, the pixel game moves to `classic.html`.
- [ ] Rollback smoothing for bodies (`Bodies3D` has none; step 3).

## Done

- 2026-11-25 step 0, four agents merged into `port-3d`: `p3d-map` (the court's room from its scene, `marker` objects, a court hash trail), `p3d-bodies` (`art/model-pose.ts` shared posing, `view3d/bodies.ts`), `p3d-fx` (`view3d/fx/`, `fx3d.html`, Fire two ways), `p3d-view` (`play3d.html`, `main3d.ts`, `View3D`, the camera, the fade). The user: bodies keep the pixel game's scale (wizard 2.7 u); the hat hiding the wizard's face at 46° is the intended look.
- 2026-11-25 `GameView` / `ViewCamera` (`client/src/game-view.ts`): the seam the loop, input and panels use; `WorldView` implements it
- 2026-11-25 the plan, from three code sweeps; the user's answers, and what a 2D sim does and doesn't rule out (height, knock-offs, bridges)
