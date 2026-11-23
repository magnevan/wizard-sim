# A map editor the user and an LLM share

Status: not started · Last touched: 2026-11-23
Record: [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid, who draws the layout) · [the decision](../decisions/README.md#2026-11-23-a-square-grid-and-a-modular-kit-the-llm-arranges-layout-code-places-geometry-explorations2026-11-23-flexible-buildingmd) · the kit: `tools/kit/` · [the opening thread](opening.md) (the places it's for)

## Where it stands

Places are now built from the modular kit on a square grid: a layout (`tools/kit/layouts/*.py`) is compiled by `tools/kit/compile.py` into made pieces and checked, and the greybox page `game/packages/client/kit3d.html` draws it. Layouts are written by hand or by Claude as Python today. The user wants an editor where they and an LLM edit the same scene together: the user by hand, the LLM through an MCP server or an HTTP API. Nothing is designed yet.

## Next

- [ ] Design the editor, as an exploration: what the user does by hand (paint corners, draw paths, pick and turn pieces, place vignettes), and what the LLM does through MCP or an API (read the scene and the compiler's report, propose and apply edits, fix what the validators refuse).
- [ ] The scene format: the `tools/kit` layout (terrace per corner, flights, curves, doors, vignettes) as the one shared source, saved so both sides see each other's edits. Decide whether it stays Python or becomes data.
- [ ] How edits reach both sides: the page and the LLM on one live scene, the compiler's errors and warnings shown in the editor.
- [ ] Then a first version on one kit patch, tried on a place from the opening.

## Done
