# How we make particle VFX

Status: active · Last touched: 2026-11-21 at c3403ea
Record: [VFX workflow](../explorations/2026-11-21-vfx-workflow.md) · Guide: [vfx-workflow.md](../vfx-workflow.md)

## Where it stands

The plan is approved. Step 1 (the spec template and critique rubric) is written; the VFX Lab and the contact-sheet tool are being built on the `worktree-vfx-workflow` branch.

## Next

- [ ] The VFX Lab (`game/packages/client/vfx-lab.html`): the game's sim and view, scene presets, `?t=` frozen frames, `window.vfxLab`.
- [ ] Contact sheets, difference frames and metrics (`game/scripts/vfx-sheet.mjs`), pointed at the VFX Lab.
- [ ] Try the loop on one real effect: issue #4 (added-element particles read as noise) is a good first case.
- [ ] Live sliders for the selected effect, and about three variants side by side.
- [ ] Pull out the arc primitive (lightning arc and chain heal draw it twice) as the first behavioural primitive.
- [ ] Decide 2D vs 3D particles before pulling out more primitives.
- [ ] Once the lab covers the gallery's cards, publish it as the gallery's replacement and retire the hand ports.

Parked: finer-resolution particles ([#12](https://github.com/magnevan/wizard-sim/issues/12)).

## How to work here

- Follow [vfx-workflow.md](../vfx-workflow.md): spec first, one change per round, run the rubric and a contact sheet before showing the user.

## Done

- 2026-11-21 The plan, merged from Claude's and Codex's lists; the spec template and rubric
