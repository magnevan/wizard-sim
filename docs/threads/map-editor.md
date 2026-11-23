# A map editor the user and an LLM share

Status: active, spec written, waiting on the user's answers · Last touched: 2026-11-23
Record: [the spec](../explorations/2026-11-23-map-editor.md) · [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid, who draws the layout) · [the decision](../decisions/README.md#2026-11-23-a-square-grid-and-a-modular-kit-the-llm-arranges-layout-code-places-geometry-explorations2026-11-23-flexible-buildingmd) · the kit: `tools/kit/` · [the opening thread](opening.md) (the places it's for)

## Where it stands

Places are built from the modular kit on a square grid: a layout (`tools/kit/layouts/*.py`) is compiled by `tools/kit/compile.py` into made pieces and checked, and the greybox page `game/packages/client/kit3d.html` draws it. The spec (draft 2, 2026-11-23) designs the editor:
- the user paints terraces in a 2D plan and judges in a live 3D view;
- pins carry "this" to Claude, and each ends as a scene edit, a compiler rule or a kit piece;
- the scene becomes JSON (`tools/kit/scenes/`), owned by a local Node server with an op history and a Python compile worker;
- Claude works through a CLI and a prompt hook first (slice A), then an MCP bridge with a Claude Code channel and a pins panel (slice B).

It came from a Sonnet code survey, Opus research on editors and LLM-connected tools, a check of the Claude Code channel docs, and Fable's first opinion and review.

## Next

- [ ] The user's answers to the spec's five open questions (no answer means the recommendations stand).
- [ ] Slice A, step 1: the compiler changes (scene dict in, structured findings with locations, instance sources, position-based window variants: `compile.py:196`) and patch B as `patch-b.scene.json`.
- [ ] Slice A, steps 2 to 5: the scene server and CLI, the editor page (plan, palette, undo, error markers, live 3D, pins, Send), the `UserPromptSubmit` hook; then the test: fix patch B's road-gate stair together.
- [ ] Slice B: the MCP bridge and channel (check that an event starts a turn in an idle session), the pins panel, picking in 3D, the flight, prop and door tools.

## Done

- 2026-11-23: the spec ([exploration](../explorations/2026-11-23-map-editor.md)), with a Codex mockup of the screen and an icon sheet.
