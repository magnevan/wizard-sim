# How we make particle VFX

Status: active · Last touched: 2026-11-21 at c3403ea
Record: [VFX workflow](../explorations/2026-11-21-vfx-workflow.md) · Guide: [vfx-workflow.md](../vfx-workflow.md)

## Where it stands

The plan is approved. Steps 1 to 3 are built on the `worktree-vfx-workflow` branch: the guide (spec template and rubric), the VFX Lab, and `npm run vfx-sheet`. Nobody has used the loop on a real effect yet.

## Next

- [ ] The user tries the VFX Lab and says whether the scenes are the right ones.
- [ ] Try the loop on one real effect: issue #4 (added-element particles read as noise) is a good first case.
- [ ] Live sliders for the selected effect, and about three variants side by side.
- [ ] Pull out the arc primitive (lightning arc and chain heal draw it twice) as the first behavioural primitive.
- [ ] Decide 2D vs 3D particles before pulling out more primitives.
- [ ] More scenes: a wall to splash against, surface floors (water, fire), an interior. A grid of several spells side by side, toward replacing the gallery.
- [ ] `WorldView` has no `destroy`, so stepping the lab backwards many times leaks GPU textures. Fine for now.
- [ ] Once the lab covers the gallery's cards, publish it as the gallery's replacement and retire the hand ports, and the Spray, Nova and Missile Labs.

Parked: finer-resolution particles ([#12](https://github.com/magnevan/wizard-sim/issues/12)).

## How to work here

- Follow [vfx-workflow.md](../vfx-workflow.md): spec first, one change per round, run the rubric and a contact sheet before showing the user.

## Done

- 2026-11-21 The plan, merged from Claude's and Codex's lists; the spec template and rubric
- 2026-11-21 The VFX Lab (real sim and view, five scenes, rune grid, `window.vfxLab`) and `npm run vfx-sheet` (contact sheets, difference frames, metrics)
