# Maintaining the vault

[Start here](start-here.md) · [Work in progress](work-in-progress.md)

## Where things go

| Folder | What belongs here |
| --- | --- |
| `world/` | Geography and setting. Add biome, region and area notes as each becomes useful to navigate. |
| `campaign/` | Approved story and segment work. A segment may visit several areas and an area may appear in several segments. |
| `systems/` | Accepted rules, spell balance and progression. Split a topic when it needs an independent home. |
| `encounters/` | Bestiary and encounter patterns. Link the creatures and places an encounter uses. |
| `presentation/` | Reusable art, animation and sound direction. |
| `ideas/` and `explorations/` | Active pitches in Ideas. Dated brainstorms, tests and discussion records in Explorations. |
| `decisions/`, `archive/` and `reference/` | Decision rationale, old worklogs and outside reference material. |

## What is true today

- **Approved design** lives with the topic. [Story canon](campaign/canon.md#approved) owns setting and story approvals. [Vision](vision.md) owns the pillars.
- **Implemented behavior** comes from the checked-out game and its data. [Current state](current-state.md) is the playable overview. Spell rules, tuning values and enemy stats belong with the code and data that the game reads.
- **Open questions** live with their idea or review. List only work being picked up on [Work in progress](work-in-progress.md). A playtest can implement a proposal before the user approves it for the design.

## When a decision changes

1. Edit the owning note in place. State the current rule in one sentence or a short list. Include an exception when it changes what a reader should expect in play.
2. Record the old choice and the reason for the change in the [decision log](decisions/README.md) or the dated exploration. Link that entry under **Context** on the owning note when the reason is worth revisiting.
3. Change other notes that repeat the rule into links to its owner as you encounter them. Keep only the detail each index needs for navigation.

For example, a short rule about regional rune regen belongs with progression. The alternatives and the review that settled it can stay in [World and Progression](explorations/2026-11-07-world-and-progression.md).

## Close a review

- Put the accepted choice or reusable lesson in the owning note. For example, [Sound direction](presentation/sound.md) keeps the decision to judge one element kit in-game.
- Leave individual ratings, asset comparisons and abandoned options in the dated record. Add a pointer when a later decision or review replaces it.
- Remove the finished review from [Work in progress](work-in-progress.md). Keep its files and links available through [Ideas and project history](archive/README.md).

## Claude artifacts

Interactive reviews can stay attached to their topics. The repository README has the full artifact inventory, and `tools/` has local page sources. Keep any exported feedback as dated evidence in `explorations/`. Record the review round, question or rating ID, and the user's answer. When a decision is confirmed, link the evidence from the owning note.
