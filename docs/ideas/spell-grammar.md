---
status: prototyping
pillars: [2, 6]
related: [../explorations/2026-11-02-what-i-like.md, ../explorations/2026-11-02-feedback-round-1.md, spell-wishlist.md]
---

# Spell grammar

## One-liner
The underlying structure of spells (what components exist and how they're input) that widens the spell space past Magicka's elements + implicit shape + cast variation.

## Latest proposal (2026-11-03)
`explorations/2026-11-03-spell-tree.md`, **Proposal A: Magicka plus two verbs**. It keeps Magicka's input and implicit element → form rule, adds a **Point** cast mode (at the cursor or on an ally) and **Seal / Release** (latent spells in vessels: staff, rune, orbit, weapon). It generates 28 of the 29 liked leaves. Waiting on the user's reaction; a subset is being wired into `prototypes/01-skeleton/`.

## Current stance
- **World simulation:** baseline elemental interactions only (wet/freeze, rain, conduction). It isn't the source of variety, and levels don't rely on gimmicks.
- **Extra components (e.g. forms, modifiers):** the main area to explore.
- **Spatial / mouse-drawn casting:** deprioritized. Mouse is for movement and aim. Richer *aiming variations* are welcome.
- **Method:** derive the grammar bottom-up from `spell-wishlist.md`.

## Magicka baseline
`elements (typed)` → `shape (implicit from elements)` × `cast mode (force / area / self / weapon)`. A lot of game knowledge was memorizing element → shape; more elements meant more power.

## Costs & risks
Every extra input axis costs finger complexity and readability. The derived-shape model is what made Magicka learnable.

## Open questions
- Which components should be explicit inputs, and which implicit?
- Is power still "stuff more elements in", or something else?

## 2026-11-03 update
The user found that many element additions did nothing in A and A.1 (measured: 1 in 3). Proposal C replaces the per-leaf rules with "form x cast + payload": see `explorations/2026-11-03-full-tree.md` and the Spell Atlas page.
