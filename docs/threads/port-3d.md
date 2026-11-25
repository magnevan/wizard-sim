# The port to 3D (the game on the kit renderer, the pixel version retired)

Status: active; plan agreed by the user, nothing built; next: step 0 · Last touched: 2026-11-25
Record: [the plan](../explorations/2026-11-25-port-3d-plan.md) (decisions, height in a 2D sim, steps, the team, risks) · [decision](../decisions/README.md#2026-11-25-the-game-moves-to-the-3d-kit-renderer-the-map-editors-scenes-feed-the-sim-explorations2026-11-25-port-3d-planmd) · [stylised 3D](../explorations/2026-11-23-stylised-3d.md) (why 3D) · [the courtyard on the kit](kit-courtyard.md) · [the map editor](map-editor.md) · [height](height.md)

## Where it stands

The playable game is all PixiJS; the 3D kit renderer is lab-only. The plan, agreed 2026-11-25: the map editor's scenes feed both the picture and the sim's room; the sim stays 2D during the port (height edges are walls both ways); a `play3d.html` page is built beside the game and becomes the game once you can walk and cast in the court; the pixel version is deleted once the battery and yard exist on the kit. Survive and the Sanctum stay headless in the sim; a new practice ground replaces the Sanctum.

Branch `port-3d` (worktree `.claude/worktrees/port-3d`), not merged. Team agents branch off it.

## Next

- [ ] Step 0: the review page (camera distances, unpixelated characters, one effect made twice, the derived walk grid over the court).
- [ ] The view interface `main.ts` talks to, extracted from `WorldView`; every workstream builds against it.
- [ ] Agree scene markers (starts, gates, regions) and the exporter's hook on save with the map editor's session.
- [ ] Step 1: one wizard walking the court in 3D, the sim driving, the room made from the scene.
- [ ] Step 2: casting, effect stand-ins, sprays, the HUD canvas, the practice ground; then the swap.

## Done

- 2026-11-25 the plan, from three code sweeps; the user's answers, and what a 2D sim does and doesn't rule out (height, knock-offs, bridges)
