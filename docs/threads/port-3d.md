# The port to 3D (the game on the kit renderer, the pixel version retired)

Status: active; the plan is written and waits for the user's read; nothing built · Last touched: 2026-11-25 at `0b43ef6`
Record: [the plan](../explorations/2026-11-25-port-3d-plan.md) (decisions, steps, the team, risks) · [stylised 3D](../explorations/2026-11-23-stylised-3d.md) (why 3D) · [the courtyard on the kit](kit-courtyard.md) · [the map editor](map-editor.md) · [height](height.md)

## Where it stands

The playable game is all PixiJS; the 3D kit renderer is lab-only. The plan moves the game onto the kit in nine steps: a second page (`play3d.html`) beside the game, one swap, then one delete. The sim doesn't change except that rooms come from kit scenes. Legacy rooms (Sanctum, Arena, Survive, tutorial) aren't migrated; the battery keeps its scenario and loses its art.

Branch `port-3d` (worktree `.claude/worktrees/port-3d`), not merged. Team agents branch off it.

## Next

- [ ] The user's answers to the plan's six questions (unanswered means the recommendation).
- [ ] Step 0: the review page (camera distances, unpixelated characters, one effect made twice, the derived walk grid over the court).
- [ ] The view interface `main.ts` talks to, extracted from `WorldView`; every workstream builds against it.
- [ ] Step 1: one wizard walking the court in 3D, the sim driving, the room made from the scene.
- [ ] Agree scene markers and the save hook with the map editor's session.

## Done

- 2026-11-25 the plan, from three code sweeps (Pixi coupling, the kit renderer, sim rooms and effects)
