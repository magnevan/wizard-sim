# A map editor the user and an LLM share

Status: active, slice A built; next: drawing curves by hand · Last touched: 2026-11-23
Record: [the spec](../explorations/2026-11-23-map-editor.md) · [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid, who draws the layout) · [the decision](../decisions/README.md#2026-11-23-a-square-grid-and-a-modular-kit-the-llm-arranges-layout-code-places-geometry-explorations2026-11-23-flexible-buildingmd) · the kit: `tools/kit/` · [the opening thread](opening.md) (the places it's for)

## Where it stands

The editor works: `npm run dev` in `game/`, then http://localhost:5187/editor.html. The user edits scenes (`tools/kit/scenes/*.scene.json`) in 3D (paint terraces, stairs, props, wall sections as plain, window or door) and pins notes; Claude edits the same scene through `tools/map-editor/cli.mjs`, and new pins reach the session through a `UserPromptSubmit` hook. The user's answers (2026-11-23): edit in 3D, talk in the terminal, Claude edits directly ([decision](../decisions/README.md#2026-11-23-the-map-editor-edit-in-3d-talk-in-the-terminal-claude-edits-directly-explorations2026-11-23-map-editormd)). What was built and how it was checked: [the spec's last section](../explorations/2026-11-23-map-editor.md#what-was-built-2026-11-23); how to use it: [tools/map-editor/README.md](../../tools/map-editor/README.md).

## Next

Editor changes live here; building the courtyard and growing the kit is its own thread, [kit-courtyard](kit-courtyard.md), which files editor gaps here as it hits them.

- [ ] **Curves by hand.** The scene format and compiler already have `curve` (a terrace bulging past one straight edge along a circle); the editor can only show them. A curve tool: drag along a terrace's edge for the ends, then drag out the bulge (radius); select one to edit its ends and radius. When the compiler learns general curves ([kit-courtyard](kit-courtyard.md) step 2), the tool grows with it.
- [ ] Placing a set piece (once the kit has the class), a figure for scale, copy and paste of regions, dragging a stair's ends.
- [ ] Later: push instead of pull, an MCP bridge with a Claude Code channel (check that an event starts a turn in an idle session).

## Done

- 2026-11-23: a usability pass after Fable's review and a from-scratch build (camera hints, strokes on the floor, + level, Add a stair here, selection, prop drag, map panel).
- 2026-11-23: slice A: the compiler on scenes, the scene server (Vite plugin), the 3D editor, the CLI and the hook; `npm run editor:check` passes.

- 2026-11-23: the spec ([exploration](../explorations/2026-11-23-map-editor.md)), with a Codex mockup of the screen and an icon sheet.
