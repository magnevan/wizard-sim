# Segment working documents

One artifact per campaign segment, for whichever beats are being worked on now. The process it serves is `docs/campaign/README.md`.

Each folder is `NN-name/`:
- `index.html`: the layout. Copy it unchanged for a new segment.
- `segment.js`: everything specific to the segment. The beats being worked on live here and nowhere else.

The page runs top to bottom: stage tracker, what's waiting on whom, the pressure strip, one chapter per place (beats, map, settled, to solve), rules of scale, what it needs, and what's parked.

Publish with `files: { "segment.js": ".../segment.js" }` and `capabilities: { db: {} }` on first publish. A later publish to the same `url` keeps the db.

**Rounds.** Note boxes use ids starting `r<round>-`. After folding a round's notes into `segment.js` and the decisions log, raise `round`, so the boxes start empty. Earlier notes stay in the db. Marks (`map-*`, `job-*`) carry over between rounds.
