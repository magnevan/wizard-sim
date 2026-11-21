---
name: triage
description: Triage the GitHub issue backlog: label new issues, link likely files, close duplicates and flag ones that may be obsolete. Use when the user says "triage", "go through the inbox", or "what's in the backlog".
---

# Triage the backlog

The backlog's rules live in `docs/tasks.md`. Run the triage in a subagent with `model: "sonnet"` and give it these steps. Keep only its summary here.

1. List the inbox, titles only: `gh issue list -R magnevan/wizard-sim --label inbox --json number,title,createdAt --limit 50`. If the user asked for an area or for stale issues, list those instead (`--label area:x`, or `--search "updated:<YYYY-MM-DD"` for anything untouched in 30 days).
2. For each issue, run `gh issue view <n> -R magnevan/wizard-sim --comments`, then:
   - **Labels:** add a kind (`bug`, `polish`, `idea`) and an `area:*`. Remove `inbox`.
   - **Files:** find the likely files with Grep/Glob (one or two searches, not an investigation). Name up to three paths.
   - **Duplicates:** search titles for the key words. If an issue is a duplicate, close it with `gh issue close <n> --reason "not planned" --comment "Duplicate of #m"`.
   - **Obsolete?** Take the filing commit from the body and run `git log --oneline <commit>..main -- <those paths>`. If commits since then touched the area, add `recheck` and name the commits. Close an issue only when a commit message or a doc plainly says the thing was fixed or removed. Otherwise leave it open with `recheck`.
3. Write one comment per issue and never edit the body:
   ```
   Triage <YYYY-MM-DD> at <short sha>:
   - Likely files: `a.ts`, `b.ts`
   - Since filing: <commits that touched these files, or "nothing touched these files">
   - <one line: duplicate of / may be obsolete because / still current>
   ```
4. Report back: a table of number, title, labels and verdict, with the `recheck` issues first. Then the user picks what to work on.

Don't fix anything during triage, and don't open issues outside the batch.
