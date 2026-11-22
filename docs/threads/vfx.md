# How we make particle VFX

Status: active · Last touched: 2026-11-22 at 478b712
Record: [VFX workflow](../explorations/2026-11-21-vfx-workflow.md) · Guide: [vfx-workflow.md](../vfx-workflow.md)

## Where it stands

The plan is approved. Steps 1 to 3 are built on the `worktree-vfx-workflow` branch: the guide (spec template and rubric), the VFX Lab, and `npm run vfx-sheet`. Round 2 (the user's notes: no aim control, reloads, typing runes) added the lab's side panel and the first knobs (the three sprays, nova speed) with Save to `fx-knobs.json`. Round 3 fixed the GPU leak and slow scrubbing and added knob A/B. Nobody has used the loop on a real effect yet.

## Next

- [ ] The user tries the VFX Lab and says whether the scenes are the right ones.
- [ ] Issue #4 (added-element particles read as noise) gets its own thread, as the first real use of the loop (the user, 2026-11-22).
- [ ] Knobs for each effect as it is reworked (the weapons' added elements for #4 next), not all up front.
- [ ] Pull out the arc primitive (lightning arc and chain heal draw it twice) as the first behavioural primitive.
- [ ] More scenes: a wall to splash against, surface floors (water, fire), an interior. A grid of several spells side by side.
- [ ] A third variant (C) beside A/B, if two turn out not to be enough.
- [ ] Retire the Spray, Nova and Missile Labs once the VFX Lab covers what they show (coverage table of 2026-11-22: missing are the sim hit-sector overlay, the swinging aim, the old-cone comparison, filmstrips at chosen times and the Earth missile kinds side by side), and retire the remaining hand ports.

Parked: finer-resolution particles ([#12](https://github.com/magnevan/wizard-sim/issues/12)).

## How to work here

- Follow [vfx-workflow.md](../vfx-workflow.md): spec first, one change per round, run the rubric and a contact sheet before showing the user.

## Done

- 2026-11-22 Gallery retired: `tools/spell-vfx/` removed (code in git history; README archived as `docs/archive/spell-vfx-gallery.md`), its artifact stays up read-only as the ratings record

- 2026-11-21 The plan, merged from Claude's and Codex's lists; the spec template and rubric
- 2026-11-21 The VFX Lab (real sim and view, five scenes, rune grid, `window.vfxLab`) and `npm run vfx-sheet` (contact sheets, difference frames, metrics)
- 2026-11-21 Round 2: the lab's side panel (rune keys, forms, drag aim, scene, time scrubber, rune grid), live without reloads; the knob registry (`art/fx-knobs.ts`), 25 knobs and the slider panel with Save
- 2026-11-22 Round 3: `WorldView.destroy()` (GPU textures flat over 200 rebuilds, were 40 → 1540), scrubbing about 5x faster (snapshots, drawing only the last ticks), knob A/B (side by side or flip with X)
- 2026-11-22 2D vs 3D decided: mediums are 2D particles, solids go through 3D ([decision](../decisions/README.md#2026-11-22-mediums-are-2d-particles-solids-go-through-3d))
