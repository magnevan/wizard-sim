# Place review (a template)

One review page per place, from the same generic `index.html`. It's the place's working surface between the user and Claude: what waits on whom, the concept to compare against, every piece from picture to scene, and the rounds of work. Rebuilt on 2026-11-27 after the infirmary's first version ([the thread](../../docs/threads/place-review.md) has the why).

## The tabs

The same top tabs on every place, so you always know where to look:

| Tab | What it holds | Where it comes from |
|---|---|---|
| **Now** | **Where it stands**, the board: the whole place and each of its parts (rows) against the stages (columns), each cell a status (done, in progress, waiting on you, next for Claude, later) with a short note and a link to its work, and an Open column counting unfinished tasks per part (click it for those tasks). Then **Decisions for you**, then three columns: **Your move** (tasks to acknowledge, check or read Claude's reply on), **In flight** (being worked on, or waiting on a render or a credit OK), **Claude's move** (your drafts to triage, your notes not yet answered). A **Draft a task** button. The badge on the tab counts what waits on you | `place.json` decisions; the db's `tasks` |
| **Tasks** | Every task, filterable by whose move, status, area, part of the place and who flagged it | db `tasks` and `events` |
| **Concept** | The approved concept, then current paintings, candidates and superseded ones. The **Concept** button in the header opens the approved ones from any tab, and every enlarged picture has **Compare with the concept** (side by side) | `place.json` concepts |
| **Pieces** | The ledger: each piece as a row of steps (picture → pick → Meshy → fit / split → in the scene, or failed / drawn in code), each step with its pictures, credits, Meshy task id and files on disk. Total credits at the top | `place.json` pieces |
| *the place's areas* | One tab per area (layout, buildings and props, ground and greenery, magic…), a sub-tab per round, newest first. Each opens with that area's open decisions and tasks | `place.json` areas |
| **Log** | One line per round, the decided decisions, finished tasks | `place.json` log; db `tasks` |

Hashes open any of them: `#now`, `#tasks`, `#concept`, `#pieces`, `#<area>`, `#<area>-<sub>`, `#log`, and `#task-<id>`, `#piece-<id>`, `#decision-<id>` jump to one item. Use them in links between items.

## Tasks (the db: `tasks` and `events`)

Every issue, to-do or idea is a task. **Nothing that needs doing or deciding is written as prose in a section**: that's how issues went missing before.

A task doc is written **once**, when it's made (by Claude, or as the user's draft). Every change after that (a status, an ack, a note, a read receipt) is a new doc in **`events`**, never an edit; the page and `review.mjs` fold the events in time order to get the task's state, with the same rules (`whose.js`). So no write needs a version and nobody's write can overwrite another's, and the events are the task's history.

```json
tasks/t-birch   {"title": "Birches are plain pale sticks", "body": "Plain text; `code` and **bold** work; #task-x links.",
                 "kind": "polish", "area": "ground", "zone": "greenhouse", "piece": "well", "decision": "q-crystal",
                 "by": "claude", "byLabel": "beauty critic", "status": "open",
                 "evidence": [{"src": "img/ev-birch.jpg", "cap": "A birch in the north wood"}], "created": "…"}
events/<id>     {"at": "2026-11-27T13:10:00Z", "by": "user", "task": "t-birch", "set": {"ack": "disagree"}}
events/<id>     {"at": "…", "by": "user", "task": "t-birch", "note": "It's the light, not the bark.", "imgs": ["/_blob/<id>"]}
events/<id>     {"at": "…", "by": "claude", "task": "t-birch", "note": "Agreed; …", "set": {"seen": "…", "status": "review", "outcome": "…"}}
events/<id>     {"at": "…", "by": "claude", "decision": "pc6-station", "reply": "Building c."}
```

Folded, a task has these fields:

- **`by`**: who flagged it, `claude`, `user`, `critic` or `codex` (`byLabel` names which critic).
- **`status`**: `triage` (your draft, Claude hasn't sorted it), `open`, `doing`, `waiting` (on a render, a credit OK or you: `waitingOn`, `waitingFor`), `review` (unused since 2026-11-27; the page still shows **Confirm done** for it), `done`, `wontfix`. Claude closes its own finished work (`done`, with an `outcome`) and asks for a look in a **review ask** instead (below): the user, 2026-11-27, "instead of acting on individual tasks for review, it's better if you just make a clean review ask for me. What you want feedback on with relevant pictures".
- **`ack`**: your answer to a task someone else flagged: `agree`, `disagree` (Claude answers before acting) or `later`. An unacknowledged task stays on Your move, but Claude doesn't wait for the ack to work on it.
- **`notes`**: one thread for both of you. A note of yours shows "not read by Claude yet" until Claude reads it (sets `seen`) or replies. A reply from Claude puts the task back on Your move until you open it (`userSeen`).
- **`kind`**: `fix`, `polish`, `build`, `idea`, `question`. A polish or fix task carries at least one evidence picture: a close-up of the fault (`/__map/view` with a tight `r`), never a description alone.
- **`outcome`**: what it became when closed: a scene edit, a rule (on the veto list) or a piece.
- **Answering hands it back.** A task `waiting` on the user goes to Claude's move by itself ("you answered") once the user has answered every decision it names (`decision`, or a list in `decisions`), or acknowledged or noted on it since it started waiting; Claude never has to move it first. Likewise a board cell marked `review` whose link is an answered decision, a task off the user's move, or a piece whose open decisions are all answered shows as "Answered, Claude's move", and answered decisions move to their own group on Now (still changeable until Claude closes them). So link waiting tasks and board cells to the decision they wait on.
- **`zone`**: which part of the place (a board row id); none means the whole place.
- **Decisions** keep the user's answer in `answers/<id>` ({choice, note, at}, written by the page); Claude's read receipt and reply on it are events (`decision`, `seen` or `reply`), shown under the answer box.
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
 "board": {"groups": [["Layout, for the whole place", "read", "paint"], ["Building it, part by part", "pieces", "beauty"]],
           "rows": [{"id": "whole", "name": "The whole place", "sub": "plan H", "href": "#layout-planh",
                     "cells": {"read": ["done", "plan D rev 9", "#layout-plans"], "pieces": ["started", "10 of 12 in", "#pieces"]}},
                    {"id": "cove", "name": "The cove and purifier", "cells": {"pieces": ["review", "your pick", "#decision-pc6-station"]}}],
           "note": "optional HTML under the board"},
 "areas": [{"id": "layout", "label": "Layout", "subs": [{"id": "planh", "label": "Plan H in 3D", "at": "2026-11-26",
            "sections": [{"title": "…", "file": "rounds/layout-planh.html"}]}]}],
 "log": [{"at": "2026-11-27", "title": "Round 8: vines and smoke", "html": "<p>…</p>"}]}
```

- **`stage`** is one of `read`, `structure`, `flow`, `sense`, `trace`, `paint`, `pieces`, `surfaces`, `dressing`, `beauty` (the stages of [making a place](../../docs/campaign/making-a-place.md)); the header shows the strip. `stages` overrides the list.
- **Concepts**: `status` is `approved` (what we're building toward; at least one), `current` (new, for the user's look), `candidate` or `superseded`. `kind`: `concept`, `painted grey-box`, `reference`.
- **Decisions** need choices and a recommendation (the check warns otherwise: a note-only box gets missed). When the answer is acted on, set `closed` to what was decided; it moves to Log. A note that changes the design (a new idea in a note box) becomes a task or a new decision, not a line in a reply.
- **Pieces**: step kinds `picture`, `pick`, `meshy`, `fit`, `split`, `placed`, `failed`, `code`, `note`. Every `meshy` or `failed` step gets a still of the model (`model-shot.py`), its credits and its Meshy task id. Models are never published (10 to 16 MB each): the page names the file.
- **Board**: one row `whole` for the whole place, then a row per part of the place (its zones: the forecourt, the cove…); a task's `zone` is one of these ids. A cell is `[status, text?, #href?]`, status `done`, `started`, `review` (waiting on the user), `next` (next for Claude), `later` or `na` (left blank: layout stages are whole-place only). Keep it current: `review.mjs board` sets a cell; change it whenever a stage moves, in the same round.
- **Rounds**: a sub-tab's sections are `{"title", "file": "rounds/<area>-<sub>.html"}`, an HTML fragment the page loads (or inline `html` for a line or two). Write a round as an ordinary file.
- **Area ids** can't be `now`, `tasks`, `concept`, `pieces` or `log`.

## The loop (every session on a place)

`review.mjs` does the bookkeeping; run it with no arguments for its commands. `<dir>` is the place's folder, e.g. `tools/infirmary-review`.

1. **Pull the db** into `<dir>/db/`: three `ArtifactData` `list` calls (collections `tasks`, `events`, `answers`, each with `out_dir` = the absolute path of `<dir>/db`).
2. **`review.mjs queue <dir>`** prints Claude's move (drafts to triage, your unread notes with their text, disagreements), answers not yet read, open decisions and the queue. Work it top down, before anything else:
   - a draft: `set <id> status=open kind=… area=… zone=…` and a `note` (a duplicate: `status=wontfix` with a link to the other);
   - a note: `note <id> "reply"` (marks it read; add `status=…` to move it);
   - a disagreement: answer it with a `note` before touching that task;
   - an answer: act on it, `reply <decision> "what it changed"`, and close the decision in `place.json` once acted on;
   - anything read and needing no answer: `seen <id>`.
3. **Work.** A finding is a task the moment it's found: `new <id> --title … --kind polish --zone … --ev img/x.jpg=caption` (`--by critic --label "flow critic"` for a critic's). A question for the user is a decision in `place.json` with pictures, choices and a pick. Every Codex picture, Meshy call, fit, split or placement: `piece <piece> <kind> …` (`--glb` renders the still; `--credits` and `--task` on every Meshy call). Finished work: `set <id> status=done outcome="…"`. When a batch of finished work wants the user's eyes, make **one review ask**: a decision `rv-<n>` in `place.json` titled "Have a look: …", its `html` a short list of exactly what you want feedback on (each point a question, with your own view), the pictures that show it in the scene, and choices `good` / `changes` (a note says what). Link the board cells it covers to it (`#decision-rv-<n>`). A `changes` answer turns into new tasks, one per point raised.
4. **Write the round** as `rounds/<area>-<sub>.html` with its pictures, a line in `log`, and the board (`review.mjs board <row> <stage> <status> "text" #href`). Move `stage` on when a gate passes.
5. **Send and publish.** `review.mjs outbox <dir>` prints the staged writes as `ArtifactData` `batch` arrays; after each commits, `review.mjs sent <dir>` moves them into `db/`. `check.mjs <dir>` checks everything (place.json, the board, round files, the db copy) and prints the publish `files` map; publish `tools/place-review/index.html` with `url` and that map, then `check.mjs <dir> --mark`.
6. **Commit** `db/` with the rest: it's the record of the session's tasks and notes.
7. **Tell the user** what's on their move, in one line, with the link.

## A new place

1. Make `tools/<place>-review/` with `place.json` (`version: 2`, the concept as an approved concept, `stage: "read"`, a board with the `whole` row and the place's parts, areas to suit the place), `img/`, `rounds/` and a `.gitignore` holding `.outbox/`.
2. `node tools/place-review/check.mjs tools/<place>-review --all` for the files map, then publish `tools/place-review/index.html` with no `url`, that map, `capabilities: {db: {}, assets: {}}` and `icon: "map"`. Then `--mark`.
3. Add the artifact to the root `README.md` and its db to `tools/CLAUDE.md`, and the link to the place's thread.

## Files

- `index.html`: the page. One copy for every place; changing it changes every place's page at its next publish.
- `whose.js`: the rules (folding events, whose move, unread), loaded by the page and by `review.mjs` and `check.mjs`, so they agree. Published beside the page by every place.
- `review.mjs`: Claude's side: the queue, notes, replies, new tasks, read receipts, the outbox, the pieces ledger, the board, and `rounds` (moves inline section HTML into files).
- `check.mjs`: checks a place (ids, pictures present and under 1.5 MB, areas, links, the board, round files, the db copy's zones and evidence, prose issue lists) and lists what to publish; keeps `.published.json` in the place's folder.
- `model-shot.py`: a still of a model for the ledger (`blender --background --python tools/place-review/model-shot.py -- <out.jpg> <in.glb> [<in.glb> <out.jpg> …]`; `review.mjs piece … --glb` runs it for you).
