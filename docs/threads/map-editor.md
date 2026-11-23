# A map editor the user and an LLM share

Status: active, slice A built and usable; next: the user tries it · Last touched: 2026-11-23
Record: [the spec](../explorations/2026-11-23-map-editor.md) · [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid, who draws the layout) · [the decision](../decisions/README.md#2026-11-23-a-square-grid-and-a-modular-kit-the-llm-arranges-layout-code-places-geometry-explorations2026-11-23-flexible-buildingmd) · the kit: `tools/kit/` · [the opening thread](opening.md) (the places it's for)

## Where it stands

The editor works: `npm run dev` in `game/`, then http://localhost:5187/editor.html. The user edits scenes (`tools/kit/scenes/*.scene.json`) in 3D (paint terraces, stairs, props, wall sections as plain, window or door) and pins notes; Claude edits the same scene through `tools/map-editor/cli.mjs`, and new pins reach the session through a `UserPromptSubmit` hook. The user's answers (2026-11-23): edit in 3D, talk in the terminal, Claude edits directly ([decision](../decisions/README.md#2026-11-23-the-map-editor-edit-in-3d-talk-in-the-terminal-claude-edits-directly-explorations2026-11-23-map-editormd)). What was built and how it was checked: [the spec's last section](../explorations/2026-11-23-map-editor.md#what-was-built-2026-11-23); how to use it: [tools/map-editor/README.md](../../tools/map-editor/README.md).

## Next

- [ ] The user tries the editor on patch B (and a blank scene from **New…**), pins what is awkward.
- [ ] Push instead of pull: an MCP bridge with a Claude Code channel (check that an event starts a turn in an idle session).
- [ ] Editing gaps: drag a stair's ends, curves by hand, copy and paste of regions, a figure for scale.
- [ ] The courtyard as a scene, once the kit can say what it needs ([opening thread](opening.md)).

## Done

- 2026-11-23: a usability pass after Fable's review and a from-scratch build (camera hints, strokes on the floor, + level, Add a stair here, selection, prop drag, map panel).
- 2026-11-23: slice A: the compiler on scenes, the scene server (Vite plugin), the 3D editor, the CLI and the hook; `npm run editor:check` passes.

- 2026-11-23: the spec ([exploration](../explorations/2026-11-23-map-editor.md)), with a Codex mockup of the screen and an icon sheet.
