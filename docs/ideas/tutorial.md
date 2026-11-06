---
status: prototyping
pillars: [2, 4, 1, 7]
related: [../explorations/2026-11-06-tutorial.md, ../explorations/2026-11-06-tutorial-pass-2.md, sanctum.md, spell-grammar.md]
---

# Tutorial

## One-liner
Nineteen short practical beats. You start with only your staff, then get one rune at a time, each one the answer to a small problem in front of you. It ends in a little test fight.

## In the hands
- **First, no runes.**
  - You walk.
  - You Strike, Heavy and Sweep straw goblins.
  - You hop out of a Brute's slam circle.
  - You block and parry an archer with a training buckler.
- **Then one rune at a time,** each one the answer to a problem:
  - Fire burns a bramble hedge your staff bounces off.
  - Water on yourself (Space) douses you after you cross burning floor.
  - Water + Fire steams goblins that are too wet to burn.
  - Cold rings slow a mob.
  - Rain, then Lightning, chains through a wet crowd.
  - Ice freezes the wet, and an Earth rock shatters them.
  - Earth + Fire lobs a fireball over a wall ("the strongest element picks the shape").
  - Life heals your apprentice, and the sleeping goblin next to them if you're careless.
  - Shield walls stop arrows.
  - An Arcane beam reaches the archers.
  - Sigil conjures a flame sword or a turret.
- **Finally, two waves** with an announced countdown to build in.

One line of text at a time. You can't die; you faint and the beat resets. Every beat has an "I know this" stone to skip it. A co-op partner does it alongside you: personal skills need both of you, and the apprentice becomes your partner.

## Why it's interesting
- It teaches the spell language in an order that builds the grammar (one element, then two meeting, then opposites, then the form rule), so a player can guess untried combinations (pillar 2).
- It doubles as the seed of the Sanctum's trials, the "practice without homework" open question.

## Costs & risks
- It hard-codes the grammar's lessons, so a rule change can mean editing a beat.
- It needs a bramble archetype, a `w.tut` state struct (null elsewhere, so the golden hash holds), gating via `runeMax`, and a few hooks guarded by `w.tut`.
- If it's too long it becomes homework, hence the skip stones and the Esc-menu entries that start at the runes or the test.
- Defend needs a guard in the game today, so the hands chapter hands out a training buckler.

## Open questions
See `../explorations/2026-11-06-tutorial.md`, *Open questions*:
- the training buckler versus a bare-handed block;
- whether wet + plain Cold should freeze;
- whether first visits land in the tutorial;
- brambles as a battlefield prop;
- one chamber versus a path;
- how much to teach;
- the tutor's voice;
- the Sanctum trials;
- co-op skip consent;
- fainting.

## Smallest test
The first eight beats (Walk, Strike, Heavy, Retreat, Defend, Fire, Water on yourself, Steam) at `#tutorial`, about 4 minutes. Do a newcomer cast steam on wet goblins without being told the rule twice?

## Status (2026-11-06, pass 2)
All nineteen beats are playable, after the user's review: calm starts (enemies walk in through far gates once you're ready), the whole rune bar with empty sockets from beat 7, and every word in `game/packages/client/src/tutorial-text.ts` as placeholders for the user's lore. The apprentice is a training dummy for now. See `../explorations/2026-11-06-tutorial-pass-2.md`.
