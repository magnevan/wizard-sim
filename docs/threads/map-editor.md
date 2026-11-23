# A map editor the user and an LLM share

Status: active, slice A built; next: grow the kit by building the courtyard in the editor · Last touched: 2026-11-23
Record: [the spec](../explorations/2026-11-23-map-editor.md) · [flexible building](../explorations/2026-11-23-flexible-building.md) (the kit, the grid, who draws the layout) · [the decision](../decisions/README.md#2026-11-23-a-square-grid-and-a-modular-kit-the-llm-arranges-layout-code-places-geometry-explorations2026-11-23-flexible-buildingmd) · the kit: `tools/kit/` · [the opening thread](opening.md) (the places it's for)

## Where it stands

The editor works: `npm run dev` in `game/`, then http://localhost:5187/editor.html. The user edits scenes (`tools/kit/scenes/*.scene.json`) in 3D (paint terraces, stairs, props, wall sections as plain, window or door) and pins notes; Claude edits the same scene through `tools/map-editor/cli.mjs`, and new pins reach the session through a `UserPromptSubmit` hook. The user's answers (2026-11-23): edit in 3D, talk in the terminal, Claude edits directly ([decision](../decisions/README.md#2026-11-23-the-map-editor-edit-in-3d-talk-in-the-terminal-claude-edits-directly-explorations2026-11-23-map-editormd)). What was built and how it was checked: [the spec's last section](../explorations/2026-11-23-map-editor.md#what-was-built-2026-11-23); how to use it: [tools/map-editor/README.md](../../tools/map-editor/README.md).

## Next

**The plan (2026-11-23): the kit grows by building a real map.** The courtyard is that map. Its structure is already approved: court plan D, rev 17 (`tools/place-plans/plans/court-d.py`), passed flow and sense at 8/10, so we trace it rather than paint a new layout. Each gap the trace hits becomes a piece or a rule, made once and reused by later places. The order follows how much of the courtyard each gap blocks:

- [ ] **1. Trace plan D into `court.scene.json`** with only what the kit has now. Curves become chamfers, and each missing thing gets a placeholder terrace plus a pin naming it. The pins become the courtyard's gap list, ranked by how much floor each one covers. The user walks it in the editor and pins more.
- [ ] **2. Large free arcs** (compiler): curves of any radius bulging from any edge, not just one straight run. The courtyard is mostly arcs: three curved terraces, a round sunk plaza and the balcony.
- [ ] **3. Curved flights and step rings** (compiler and a tread variant): the dais's two rings and the plaza's ring of steps.
- [ ] **4. Set pieces** (a new kit class: one unique Meshy model on a footprint the compiler keeps clear and walls off): the armillary, the great hall's front, the bell tower, the beacon and the pylons. Each one: Codex picture, then Meshy, then `fit.py`.
- [ ] **5. Water and the sea edge**: a water terrace, a quay edge and a cliff face (the inlet, the quay at -5 m, the falls).
- [ ] **6. Spans**: the bridge over the inlet as a deck piece between two terraces.
- [ ] **7. Dressing pass**: a loose Codex paint-over of the courtyard's greybox gives the dressing (niches, lamps, planters, floor channels to the exits). The pieces it asks for join the kit.
- [ ] **Editor gaps, as the courtyard hits them**: placing a set piece, drawing curves by hand (needed from step 2), a figure for scale, copy and paste of regions, dragging a stair's ends.
- [ ] Later: push instead of pull, an MCP bridge with a Claude Code channel (check that an event starts a turn in an idle session).
- [ ] Then the yard and the infirmary on the kit ([opening thread](opening.md)). They should need far fewer new pieces.

## Done

- 2026-11-23: a usability pass after Fable's review and a from-scratch build (camera hints, strokes on the floor, + level, Add a stair here, selection, prop drag, map panel).
- 2026-11-23: slice A: the compiler on scenes, the scene server (Vite plugin), the 3D editor, the CLI and the hook; `npm run editor:check` passes.

- 2026-11-23: the spec ([exploration](../explorations/2026-11-23-map-editor.md)), with a Codex mockup of the screen and an icon sheet.
