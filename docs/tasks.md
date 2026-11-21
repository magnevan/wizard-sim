# Tasks: threads and the backlog

How work is tracked between sessions. Decided 2026-11-21 ([exploration](explorations/2026-11-21-task-management.md)).

There are three homes, one for each kind of work:

| Kind | Home | Example |
|---|---|---|
| A thread: an ordered line of work with a clear next step | `docs/threads/<name>.md` | the opening's beats, the weapons' movesets |
| A loose discovery: noticed now, dealt with later | a GitHub issue on [magnevan/wizard-sim](https://github.com/magnevan/wizard-sim/issues) | "the maul clips the robe at the end of the swing" |
| How Claude should work | Claude's memory | "build optimistically" |

Reviews in progress are listed in [work-in-progress.md](work-in-progress.md), which also links each active thread.

## Filing an issue

You can file with no Claude usage left:

- **From the game: F8** (or Esc › Resume › Report an issue). Write one line and press Enter. A new GitHub issue opens with the room, the checkpoint, the build's commit and the Stats panel's rows filled in. The frame is on your clipboard: press Ctrl+V on the page to attach it, then Submit.
- **From GitHub:** New issue › Note. Only the title is required.
- **In a session:** say "file that" (or "file: ..."). The `file` skill files it in one call and goes back to the work at hand.

What you write stays as you wrote it. Nobody rewrites the body. Triage and investigation add comments.

## Labels

- `inbox`: filed and not yet triaged. Every new issue starts with it.
- Kind: `bug` (works wrong), `polish` (works, but looks, sounds or feels off), `idea`.
- Area: `area:animation`, `area:art`, `area:sound`, `area:story`, `area:gameplay`, `area:ui`, `area:tools`, `area:net`.
- `from-game`: filed with F8.
- `recheck`: may be obsolete; check against the current game before working on it.

## Triage

The `triage` skill runs on Sonnet when you ask for it, in batches. For each `inbox` issue it:
- adds kind and area labels;
- links the likely files;
- closes duplicates (pointing to the issue kept);
- checks whether commits since the filing commit touched the area, and if so adds `recheck`.

It writes what it finds as **one comment**, starting `Triage <date> at <commit>:`, and removes `inbox`. It doesn't investigate causes; the agent that picks the issue up does that against the code as it is then.

## Keeping it current

- Every issue carries the commit it was filed at (the F8 body, or the `file` skill's footer).
- Whoever looks at an issue leaves a dated comment: `Checked <date> at <commit>: still happens / obsolete because ...`.
- Commits that fix an issue say `Fixes #n` in the message, so it closes on push to main.
- An issue made obsolete by other work is closed as **not planned**, with a comment naming the commit or thread that made it so.
- When a thread finishes a step, its agent lists the open issues in that area (`gh issue list --label area:<x>`) and comments on or closes the ones the work affected.

## Rules for agents (context cost)

- Never list the whole backlog unfiltered or with bodies. Search by label or keyword and list titles only, for example:
  `gh issue list -R magnevan/wizard-sim --label area:animation --json number,title,updatedAt,labels`
- Open an issue's body (`gh issue view <n> --comments`) only when picking it up or triaging it.
- Thread files stay short: a status line, the next steps, and links to where the details live. A finished step shrinks to one line. Long as-built notes go in the thread's exploration.
- Memory holds working preferences only. Project state goes in a thread file or an issue, where the user can see it.

## Threads

A thread file has this shape:

```
# <Thread name>
Status: active | paused | done · Last touched: <date> at <commit>
Record: <the exploration(s) with the detail>

## Where it stands
2 to 5 lines.

## Next
- [ ] the next step
- [ ] ...

## Done
- <date> one line per finished step (commit)
```

Start a thread when a line of work will run across sessions. When it's done, `git mv` it to `docs/archive/` and remove its line from work-in-progress.md. The current threads are listed in [threads/README.md](threads/README.md).
