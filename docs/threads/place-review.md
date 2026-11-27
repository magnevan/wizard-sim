# The place review page and its loop

Status: v2 live on the infirmary with the board and Claude's helpers; for the user's first look · Last touched: 2026-11-27
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
- [ ] Maybe later: draw the board's parts on a small plan of the place (each zone a shape, coloured by its stage), beside the table.
- [ ] Maybe later: a 3D viewer for slimmed models (`kit/` sizes, a few MB) beside the stills; a pin-to-task bridge from the map editor.

## Done

- 2026-11-27: the user: "Do you think this is easy for an agent to work with as well?" Not yet: whose move had to be worked out by hand, replies meant rewriting arrays, round write-ups were HTML inside JSON. Then the user asked for the helpers and "more visualization of where we are in the overall journey", after the Opening Segment page's stop-by-stage table. Built: **the board** on Now (the whole place and its parts against the stages, cells linking to their work, open tasks per part, a part filter on Tasks); **events** (every change is a new doc, folded by `whose.js`, shared by page and helper: no versions, nothing overwritten, a history); **`review.mjs`** (queue, show, note, set, seen, reply, new, outbox, sent, piece with `--glb` stills, board, rounds); `check.mjs` checks the board, round files and db copy; round write-ups in `rounds/*.html`; the db copied into `db/` and committed. The infirmary: board with five parts, 11 tasks given their part, the 22 old answers marked read.
- 2026-11-27: v2 of the template, the loop written into its README and [making a place](../campaign/making-a-place.md), the infirmary page moved over and published.
