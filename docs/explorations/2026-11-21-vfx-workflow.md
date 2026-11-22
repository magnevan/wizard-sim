# How we make particle VFX (2026-11-21)

The user asked for ways to improve how we make particle VFX, to go back and forth on before building. Claude proposed a list, the user brought a second list from Codex for a fresh view, and the two were merged. The working guide that came out of it is [vfx-workflow.md](../vfx-workflow.md); the line of work is the [VFX thread](../threads/vfx.md).

## How it worked before

- **Every effect existed twice.** The Spell VFX gallery (`tools/spell-vfx/`, since retired and in git history; about 6,800 lines of plain JS) is where looks were designed and rated. The game (`game/packages/client/src/art/vfx.ts`, `spray-jet.ts`, `novas.ts`, `deaths.ts` and others) got ports of them, often line by line. The gallery's README records where the copies have drifted.
- **Effects were code, not data.** A stream is an inline `emit(t, rate, life, fn)` call (`art/util.ts`) with its numbers in the drawing code. The emitter is good (stateless, deterministic), but nothing can be tuned without editing code.
- **The loop was a round trip in words.** The user plays, describes the problem ("the middle looks static", "too round"), Claude edits, the user reloads. The Spray Lab (`spray-lab.html`, [spray VFX](2026-11-10-spray-vfx.md)) helped by showing one to five runes side by side with the game's own code, but only for sprays.

## Claude's list

1. One source of truth: grow the Spray Lab into a VFX Lab that runs the game's code, and let the gallery become a published build of it.
2. Effects as data: emitter descriptors (spawn shape, rate, life, motion, size and colour over life, a drawing primitive); bespoke effects stay code.
3. One rule for rune scaling (the user's "more runes should look like an upgrade, five should give some awe").
4. A named library of particle looks, so feedback can say "use the imp's ember here".
5. Live tuning sliders beside F2 Tune, saved back to source.
6. A/B variants on the same card, same seed.
7. In-game VFX feedback: F8 with the spell, runes and a few frames attached.
8. Automatic filmstrips and metrics, so Claude checks motion before the user sees it.
9. Scene presets for judging in context: a crowded fight, a dark room, four casters, an effect over an ally.
10. A per-effect performance budget in F4 Stats.
11. The 2D particles over 3D models question (`live3d.ts` draws the models; particles can't go behind a body or catch its light).
12. PixelLab's `vfx_workbench` for sprite effects where code struggles (credits, less control across rune counts).

## What Codex added

Codex's list overlapped on the feedback loop, primitives and a parameter playground. Taken from it:
- **A design spec before code.** Silhouette, movement, colour, what reads first and second, timing, rune scaling. The build is then judged against the same spec.
- **A critique rubric with restraint built in.** "Could removing particles improve it?" and "judge it at gameplay scale". Issue #4 (added-element particles read as noise) is that failure.
- **One change per round**, so each note maps to one change.
- **A record per effect:** spec, parameters, seed and preview kept together.
- Details: capture motion densely (Claude can't watch video, so contact sheets, difference frames and numbers stand in); primitives are behaviours (arc, burst, emission, field), not sprite looks; take a reference apart into layers before imitating it; keep variant grids to about three, not nine.

Pushed back on: mixing resolutions (finer particles over the pixel art). The smooth light layer already exists (the banded light map); finer particles would break one-pixel-size pixel art. The user raised it because some pixel effects are hard to read, and agreed to hold off: [#12](https://github.com/magnevan/wizard-sim/issues/12).

## Decided

The user approved the merged plan (2026-11-21), in this order:
1. The spec template and critique rubric, the rubric seeded from the user's past notes. Docs and habits, no code.
2. One VFX Lab running the game's sim and view, with scene presets.
3. Automatic contact sheets, difference frames and metrics, so Claude checks its own work first.
4. Live sliders and about three variants on one card.
5. Pull out the arc, burst, emission and field primitives as effects get touched.
6. Decide 2D vs 3D particles before investing heavily in 5.

Claude's open question (should the user approve each spec before building?) went unanswered, so Claude's pick stands: the user approves the spec for a new or reworked effect; for a tweak the spec is Claude's working note.

## 2D or 3D particles (2026-11-22)

The user had no strong view and asked for a recommendation. Two facts settled most of it: depth around bodies is already handled in 2D (`art/depth.ts`), and the 3D models are rendered down to pixel art (`live3d.ts`), so everything already meets in one pixel-art picture. The rule: **mediums are 2D particles, solids go through 3D** ([decision](../decisions/README.md#2026-11-22-mediums-are-2d-particles-solids-go-through-3d)).

## The old gallery is retired (2026-11-22)

The user didn't use the Spell VFX gallery much and won't again. Its code was removed, its README kept as a record in the archive, and its published artifact left up for its ratings. The single-purpose labs (spray, nova, missile) are retired where the VFX Lab covers them.
