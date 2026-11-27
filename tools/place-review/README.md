# Place review (a template)

One review page for a place being built on the kit, reused for every place. The page (`index.html`, here) is generic: it reads a `place.json` beside it and draws:

- **Now**, the front tab: the **decisions pending**, each with the pictures it needs and an answer box, and a **task board**: every flagged issue as a task with its **evidence pictures**, in columns To do, In progress, Done, Won't do. Anyone with access changes a task's status from its menu.
- **One tab per area** of the place (layout, buildings and props, ground and greenery, magic…), with a **sub-tab per round** of work.

Asked for by the user on 2026-11-27, on the infirmary: "the front page should be todo list and decisions pending", flagged issues "should come with some evidence", "managed a bit like tasks", "a template we can re-use".

## A new place

1. Make a folder for the place's review, e.g. `tools/<place>-review/`, with `place.json` and `img/`.
2. Publish this template as the page, with the place's files beside it. For a new artifact: publish `tools/place-review/index.html` with `files` mapping `place.json` and every `img/...` it uses to the place's folder, and `capabilities: {db: {}}`. For an existing one, publish the same way with its `url`. The template has no copies: every place's artifact publishes this one file.
3. List the artifact in the root `README.md` and its db ids in `tools/CLAUDE.md`.

## place.json

```json
{
  "title": "The Infirmary on the Kit", "eyebrow": "The opening · stop 1 · Life",
  "lede": "One paragraph; HTML allowed.",
  "note": "A line under the task board; HTML allowed.",
  "decisions": [
    {"id": "q-crystal", "title": "The question", "html": "<p>Context</p>",
     "figures": [{"src": "img/x.jpg", "cap": "What this picture shows"}],
     "rec": "My pick: <b>…</b>", "choices": [{"v": "glow", "label": "Let it glow"}]},
    {"id": "q-plan", "title": "Which plan", "closed": "plan H (built)"}
  ],
  "tasks": [
    {"id": "t-birch", "kind": "polish", "status": "open", "title": "Birches are plain pale sticks",
     "html": "Detail.", "evidence": [{"src": "img/ev-birch.jpg", "cap": "A birch in the north wood"}]}
  ],
  "areas": [
    {"id": "layout", "label": "Layout", "subs": [
      {"id": "planh", "label": "Plan H in 3D", "sections": [{"title": "…", "html": "<section>…</section>"}]}
    ]}
  ]
}
```

- **Decisions:** open ones show on Now with their figures and answer box; a decision with `closed` (what was decided) moves to the collapsed Decided list. Close a decision in `place.json` once its answer is acted on.
- **Tasks:** `kind` is `build` or `polish`; `status` is the default (`open`, `doing`, `done`, `wontfix`); the db's status wins once someone sets one. Every polish task carries at least one evidence picture: a close-up render of the fault (`/__map/view` with a tight `r`), never a description alone.
- **Areas:** sections are HTML, written as each round happens: what changed, its pictures, what's still rough. Newest round first.
- **Hashes:** `#now`, `#<area>`, `#<area>-<sub>` open a tab or sub-tab.

## Feedback

In the artifact's db: `answers` (one doc per decision id: `{choice, note}`; `general` is the Anything else box) and `tasks` (one doc per task id: `{status}`). Read both before working on a place.
