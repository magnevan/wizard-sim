# The place review page and its loop

Status: v2 built and live on the infirmary, for the user's first look · Last touched: 2026-11-27
Record: [the template](../../tools/place-review/README.md) (tabs, data, the loop) · [making a place](../campaign/making-a-place.md) · [the infirmary on the kit](infirmary-kit.md) (paused for this, the first place on v2) · page: [The Infirmary on the Kit](https://claude.ai/artifact/9xpg4f5Ye54kgLyGKrMEvA)

## Where it stands

The user, 2026-11-27, starting this thread: the ad-hoc improvements to the review page mid-work "hasn't been so great"; the goal is "a re-usable artifact template & process we can use to create many locations". Asked for: a front page showing the work that needs doing, what's pending and the decisions to make; a hierarchical tab structure that's reusable; easy access to the latest or approved concept art to cross-reference; a polished internal task system where issues aren't buried as notes, each task records who flagged it and whether the user has acknowledged it, the user can note on and disagree with a flagged task, and can draft tasks for Claude to triage; a structured view of the pictures sent to Meshy, the models back and their revisions.

What went wrong before (a survey of the court and infirmary pages' dbs and history):
- Notes typed into the wrong box (the beam notes in the rock's box), one not saved and only caught by chance (round 14), design ideas left as notes under a rejected option (the per-bed emitter in `pc5-frame`, which became the devices' whole brief), and follow-ups in the "Anything else" box. Nothing showed whether Claude had read a note.
- Tasks were defaults in `place.json` with a status the db could override; the `tasks` collection was never written, so nothing showed what the user thought of a flagged issue.
- Issues also lived as prose (a section's "what's off" list), easy to miss.
- No record of which picture went to which Meshy task or what it cost: only prose in the thread's Done lines.
- The "court" page (https://claude.ai/artifact/3dWPYc5ZxZqgrYfpksnegu) is the port-to-3D and spell-effects review; the courtyard itself was reviewed through map-editor pins only.

v2 (built 2026-11-27):
- Fixed top tabs: **Now** (decisions, then Your move / In flight / Claude's move, and Draft a task), **Tasks** (filters), **Concept**, **Pieces** (the ledger), the place's own areas with round sub-tabs, **Log**. A stage strip in the header; a Concept button and Compare with the concept on every enlarged picture.
- Tasks live in the db with `by`, `ack` (agree, disagree, not now), a note thread with read receipts, evidence, `review` before `done`. Whose move is derived from them, with the reason shown.
- The pieces ledger records each step with stills of the models (`model-shot.py`), credits and files; models stay on disk.
- `check.mjs` checks `place.json` and lists only the changed files to publish.
- The infirmary moved over: 16 tasks in its db, 12 pieces (330 credits), 13 concept pictures; its `pieces` area renamed `props` (the id clashes with the built-in tab).

## Next

- [ ] **The user's first look at v2** on the infirmary page: the structure, the front page, the task flow (acknowledge a few tasks, draft one, disagree with one).
- [ ] Fold the user's notes into the template, then resume [the infirmary](infirmary-kit.md) on it.
- [ ] Use the loop on the infirmary for a round or two; then make the courtyard's review page from it when its polish pass starts (its pins could seed tasks).
- [ ] Maybe later: a 3D viewer for slimmed models (`kit/` sizes, a few MB) beside the stills; a pin-to-task bridge from the map editor.

## Done

- 2026-11-27: v2 of the template, the loop written into its README and [making a place](../campaign/making-a-place.md), the infirmary page moved over and published.
