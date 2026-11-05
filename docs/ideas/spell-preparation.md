---
status: developing
pillars: [4, 6]
related: [spell-wishlist.md, casting-rhythm.md, ../explorations/2026-11-03-wishlist-round-1.md]
---

# Spell preparation

## One-liner
Use downtime to prepare: lay traps, ready orbitals or seekers, or store a composed spell to release later.

## In the hands
- **Stored spell** (a power gained during the game): compose a spell, bank it, and release it later with one input. Uses:
  - long combos you can't type in a crisis
  - burst: release together with a freshly cast spell
  - a combo piece timed to land at the right moment
  - an oh-shit escape
- **Traps / glyphs:** shape the arena before enemies arrive.
- **Primed objects:** orbiting stones or seekers that are prepared, then triggered.

## Why it's interesting
Preparing your environment while waiting for enemies becomes a skill. It suits the slower pace pillar and rewards planning. A stored spell also separates *composing* a spell from *delivering* it, so typing speed matters less in a crisis and good preparation matters more.

## Costs & risks
- Magicka's mines failed because they were inflexible to cast, easy to blow yourself up with, and the pacing gave no time to prepare. Needs: flexible placement, a readable trigger radius / arming delay, and encounters with lulls.
- Preparation must be rewarded but not mandatory, or every fight starts with a chore.

## Open questions
- How many stored spells? One slot, or more as progression?
- Does releasing a stored spell cost anything (resource, cooldown)?

## Where it stands (2026-11-05)
- **The trap and primed-object half is built** as Sigil devices in the game: glyphs and line glyphs, turrets, orbitals and rune motes, each binding a Sigil rune ([Sigil's identity](../decisions/README.md#2026-11-04-sigils-identity-see-explorations2026-11-04-sigil-identity-and-buffsmd); tracked in `battlefield-building.md`). Survive's lulls are where they get placed.
- **The stored spell is deferred:** "preparing a spell becomes its own mechanism, deferred" ([Seal becomes an element](../decisions/README.md#2026-11-03-seal-becomes-an-element-steam-and-ice-dropped-see-explorations2026-11-03-structures-review-and-elementsmd)). Its open questions above (how many slots, what releasing costs) are still open, which is why this stays `developing`.
