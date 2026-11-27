# Place review (a template)

One review page per place, from the same generic `index.html`. It's the place's working surface between the user and Claude: what waits on whom, the concept to compare against, every piece from picture to scene, and the rounds of work. Rebuilt on 2026-11-27 after the infirmary's first version ([the thread](../../docs/threads/place-review.md) has the why).

## The tabs

The same top tabs on every place, so you always know where to look:

| Tab | What it holds | Where it comes from |
|---|---|---|
| **Now** | **Decisions for you**, then three columns: **Your move** (tasks to acknowledge, check or read Claude's reply on), **In flight** (being worked on, or waiting on a render or a credit OK), **Claude's move** (your drafts to triage, your notes not yet answered). A **Draft a task** button. The badge on the tab counts what waits on you | `place.json` decisions; the db's `tasks` |
| **Tasks** | Every task, filterable by whose move, status, area and who flagged it | db `tasks` |
| **Concept** | The approved concept, then current paintings, candidates and superseded ones. The **Concept** button in the header opens the approved ones from any tab, and every enlarged picture has **Compare with the concept** (side by side) | `place.json` concepts |
| **Pieces** | The ledger: each piece as a row of steps (picture → pick → Meshy → fit / split → in the scene, or failed / drawn in code), each step with its pictures, credits, Meshy task id and files on disk. Total credits at the top | `place.json` pieces |
| *the place's areas* | One tab per area (layout, buildings and props, ground and greenery, magic…), a sub-tab per round, newest first. Each opens with that area's open decisions and tasks | `place.json` areas |
| **Log** | One line per round, the decided decisions, finished tasks | `place.json` log; db `tasks` |

Hashes open any of them: `#now`, `#tasks`, `#concept`, `#pieces`, `#<area>`, `#<area>-<sub>`, `#log`, and `#task-<id>`, `#piece-<id>`, `#decision-<id>` jump to one item. Use them in links between items.

## Tasks (the db, collection `tasks`)

Every issue, to-do or idea is a task. **Nothing that needs doing or deciding is written as prose in a section**: that's how issues went missing before. One doc per task:

```json
{"title": "Birches are plain pale sticks", "body": "Plain text; `code` and **bold** work; #task-x links.",
 "kind": "polish", "area": "ground", "piece": "well", "decision": "q-crystal",
 "by": "claude", "byLabel": "beauty critic", "status": "open",
 "ack": null, "ackAt": null, "seen": null, "userSeen": null,
 "waitingOn": "user", "waitingFor": "your OK on the sheet",
 "evidence": [{"src": "img/ev-birch.jpg", "cap": "A birch in the north wood"}],
 "notes": [{"by": "user", "at": "2026-11-27T13:10:00Z", "text": "…", "imgs": ["/_blob/<id>"]}],
 "outcome": "rule: birch bark sheet in foliage.ts", "created": "…", "updated": "…"}
```

- **`by`**: who flagged it, `claude`, `user`, `critic` or `codex` (`byLabel` names which critic).
- **`status`**: `triage` (your draft, Claude hasn't sorted it), `open`, `doing`, `waiting` (on a render, a credit OK or you: `waitingOn`, `waitingFor`), `review` (Claude thinks it's done; you confirm or reopen), `done`, `wontfix`. Claude never sets `done` on its own work: it sets `review`, and the user's **Confirm done** closes it.
- **`ack`**: your answer to a task someone else flagged: `agree`, `disagree` (Claude answers before acting) or `later`. An unacknowledged task stays on Your move, but Claude doesn't wait for the ack to work on it.
- **`notes`**: one thread for both of you. A note of yours shows "not read by Claude yet" until Claude reads it (sets `seen`) or replies. A reply from Claude puts the task back on Your move until you open it (`userSeen`).
- **`kind`**: `fix`, `polish`, `build`, `idea`, `question`. A polish or fix task carries at least one evidence picture: a close-up of the fault (`/__map/view` with a tight `r`), never a description alone.
- **`outcome`**: what it became when closed: a scene edit, a rule (on the veto list) or a piece.
- Pictures you paste or attach upload to the artifact's assets (`/_blob/<id>`); Claude reads one with `Artifact` `read` and `path` = the id.

**Whose move** is worked out on the page from these fields, never stored.

## place.json (Claude writes it)

```json
{"version": 2, "title": "…", "eyebrow": "The opening · stop 1 · Life", "lede": "HTML",
 "stage": "pieces",
 "credits": "One line on the Meshy budget",
 "concepts": [{"id": "concept", "src": "img/concept.jpg", "title": "The concept", "cap": "…", "kind": "concept",
               "status": "approved", "at": "2026-11-22"}],
 "decisions": [{"id": "pc6-station", "title": "…", "area": "props", "piece": "devices", "html": "<p>…</p>",
                "figures": [{"src": "img/x.jpg", "cap": "a: …"}], "rec": "My pick: <b>c</b>…",
                "choices": [{"v": "a", "label": "a"}, {"v": "redo", "label": "Redo"}]},
               {"id": "q-plan", "title": "Which plan", "closed": "plan H (built)"}],
 "pieces": [{"id": "well", "name": "The caged well", "area": "magic", "status": "in the scene", "html": "optional",
             "steps": [{"kind": "picture", "at": "2026-11-26", "title": "Round 1", "imgs": [{"src": "img/pc-well-a.jpg", "cap": "a"}], "note": "HTML"},
                       {"kind": "pick", "at": "2026-11-26", "title": "b"},
                       {"kind": "meshy", "at": "2026-11-26", "credits": 30, "task": "<meshy task id>", "imgs": [{"src": "img/model-well.jpg", "cap": "What Meshy sent back"}],
                        "files": ["game/content/generated/meshy/kit-src/infirmary/infirmary-well.glb"]},
                       {"kind": "fit", "at": "…", "title": "setpiece.infirmary-well"}]}],
 "areas": [{"id": "layout", "label": "Layout", "subs": [{"id": "planh", "label": "Plan H in 3D", "at": "2026-11-26",
            "sections": [{"title": "…", "html": "<section>…</section>"}]}]}],
 "log": [{"at": "2026-11-27", "title": "Round 8: vines and smoke", "html": "<p>…</p>"}]}
```

- **`stage`** is one of `read`, `structure`, `flow`, `sense`, `trace`, `paint`, `pieces`, `surfaces`, `dressing`, `beauty` (the stages of [making a place](../../docs/campaign/making-a-place.md)); the header shows the strip. `stages` overrides the list.
- **Concepts**: `status` is `approved` (what we're building toward; at least one), `current` (new, for the user's look), `candidate` or `superseded`. `kind`: `concept`, `painted grey-box`, `reference`.
- **Decisions** need choices and a recommendation (the check warns otherwise: a note-only box gets missed). When the answer is acted on, set `closed` to what was decided; it moves to Log. A note that changes the design (a new idea in a note box) becomes a task or a new decision, not a line in a reply.
- **Pieces**: step kinds `picture`, `pick`, `meshy`, `fit`, `split`, `placed`, `failed`, `code`, `note`. Every `meshy` or `failed` step gets a still of the model (`model-shot.py`), its credits and its Meshy task id. Models are never published (10 to 16 MB each): the page names the file.
- **Area ids** can't be `now`, `tasks`, `concept`, `pieces` or `log`.

## The loop (every session on a place)

1. **Read the db first.** `ArtifactData` `list` on `answers` and `tasks`. For each task on Claude's move: triage drafts (set `status`, `kind`, `area`, a reply note; a duplicate is `wontfix` with a link), read and answer notes (set `seen`, reply in `notes`), answer every `disagree` before acting on that task. Act on answered decisions and record what each answer changed.
2. **Work.** Each finding goes in as a task with evidence the moment it's found (`by: "claude"`, or `critic` with `byLabel`). Each question that needs the user becomes a decision with pictures, choices and a pick. Each Codex picture, Meshy call, fit, split or placement becomes a step on its piece. Finished work goes to `review`, not `done`.
3. **Write the round** into its area sub-tab (what changed, its pictures) and a line in `log`. Move `stage` on when a gate passes.
4. **Check and publish.** `node tools/place-review/check.mjs tools/<place>-review` checks `place.json` and prints the `files` map of what changed since the last publish. Publish `tools/place-review/index.html` with `url` and that map, then `check.mjs … --mark`. Task writes go straight to the db (`ArtifactData` `batch`), no publish needed.
5. **Tell the user** what's on their move, in one line, with the link.

## A new place

1. Make `tools/<place>-review/` with `place.json` (`version: 2`, the concept as an approved concept, `stage: "read"`, areas to suit the place) and `img/`.
2. `node tools/place-review/check.mjs tools/<place>-review --all` for the files map, then publish `tools/place-review/index.html` with no `url`, that map, `capabilities: {db: {}, assets: {}}` and `icon: "map"`. Then `--mark`.
3. Add the artifact to the root `README.md` and its db to `tools/CLAUDE.md`, and the link to the place's thread.

## Files

- `index.html`: the page. One copy for every place; changing it changes every place's page at its next publish.
- `check.mjs`: checks a place's `place.json` (ids, pictures present and under 1.5 MB, areas, links, prose issue lists) and lists what to publish; keeps `.published.json` in the place's folder.
- `model-shot.py`: a still of a model for the ledger (`blender --background --python tools/place-review/model-shot.py -- <out.jpg> <in.glb> [<in.glb> <out.jpg> …]`).
