---
name: file
description: File a discovery as a GitHub issue without leaving the current work. Use when the user says "file that", "file: ...", "note that for later", "add it to the backlog", or when you notice something off that is outside the current task.
---

# File an issue

The backlog's rules live in `docs/tasks.md`. This skill is one call, then back to the work at hand. Don't investigate, don't fix, and don't read other issues beyond the duplicate check.

1. **Title:** one line in the user's words (or your own if you noticed it), saying what is wrong or wanted. No prefix.
2. **Body:** keep it short. Quote the user's words exactly if they gave any, then add at most three lines of context you already have: where it shows (room, `?at=` checkpoint, weapon, spell), and how to see it. Don't guess at causes. End with this footer:
   ```
   ---
   **Filed:** <YYYY-MM-DD> at commit `<git rev-parse --short HEAD>` (branch `<branch>`), during <the thread or task you're on>
   ```
3. **Labels:** `inbox`, plus a kind (`bug`, `polish`, `idea`) and one `area:*` (`animation`, `art`, `sound`, `story`, `gameplay`, `ui`, `tools`, `net`) if they're obvious. Leave them off if they're not.
4. **Duplicate check, titles only:** `gh issue list -R magnevan/wizard-sim --search "<2-3 key words>" --json number,title`. If one clearly matches, comment there instead of filing a new issue.
5. File it: write the body to `$CLAUDE_JOB_DIR/tmp/issue.md` (or a scratch file), then run `gh issue create -R magnevan/wizard-sim --title "..." --body-file <file> --label inbox,...`.
6. Tell the user the number and title in one line, then go back to the work.

Several items at once ("file these three"): one issue each, one line of reply each.
