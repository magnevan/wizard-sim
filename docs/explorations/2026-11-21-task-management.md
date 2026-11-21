# Task management (2026-11-21)

How work is tracked across sessions. The result is [tasks.md](../tasks.md); the decision is in the [log](../decisions/README.md#2026-11-21-tasks-live-in-thread-files-and-github-issues-explorations2026-11-21-task-managementmd).

## The problem, in the user's words

- "There's a lot of small and large things I discover as I test the game... I'm worried that there's a lot that gets lost in a thread as we go down some path and I need to clear context regularly."
- Discoveries made while focused on something else (an animation issue found while testing a gameplay section) should be filed for later, not dealt with now.
- Tasks are also found while testing alone, and filing should be easy: "I do want to be able to file when I don't have any usage left too."
- Some tasks are a thread's clear next steps (a story's beats, sounds for a list of spells). Others are a backlog of random issues.
- All implementation is done by agents, so the organisation mustn't bloat context.
- Tasks go stale through work done elsewhere, so they need creation dates and a log of when they were looked at.
- The user had little insight into memories, and `work-in-progress.md` is very high level.

## What was found

Four memories were really per-thread resume notes: the opening, the Model Viewer, weapon motion and sound status. They were invisible to the user, and several were already wrong: they said branches were "NOT merged" that had since been merged into main.

## Options weighed

| Option | For | Against |
|---|---|---|
| **GitHub issues** (chosen for the backlog) | works with no Claude usage (phone, web, the game); dates and a comment log built in; close as not planned when obsolete; agents list titles cheaply | public with the repo (the user is fine with it); a manual issue is fiddly for a one-liner, so it needs the F8 box and the `file` skill |
| A markdown backlog in the repo | everything in one place, diffable | grows without bound; agents read it whole; needs Claude or git to file |
| An artifact page with a db | visual, fits the review pages | needs claude.ai; agents read it through a tool; no history per item |
| A private issues repo | keeps half-formed ideas private | a second repo for a hobby project; the user doesn't mind public |

Thread files in `docs/threads/` replace the resume memories: the same content, short, visible, and in git history.

## Enrichment

The user's text is kept as written. A cheap model (Sonnet) triages in batches: labels, likely files, duplicates, and whether commits since filing touched the area. The implementing model does the real investigation when it picks an issue up, against the code as it is then. Expanding a note with a model at filing time was rejected, because early guesses at causes go stale and mislead whoever picks the issue up.

## Built

- F8 report box in the game (`game/packages/client/src/report.ts`), also in Esc › Resume. It stamps the build's commit (`__BUILD_COMMIT__`).
- `file` and `triage` skills (`.claude/skills/`); a one-field issue form (`.github/ISSUE_TEMPLATE/note.yml`); labels on magnevan/wizard-sim.
- Thread files: [weapons](../threads/weapons.md), [opening](../threads/opening.md), [sound](../threads/sound.md).
