---
status: prototyping    # in the game as #survive (2026-11-05)
pillars: [1, 3, 7]
related: [../explorations/2026-11-05-survive-mode.md, ../explorations/2026-11-03-encounters.md, progression.md, death-and-revival.md]
---

# Survive mode

## One-liner
Endless waves in a walled arena. Between waves, each player walks onto one of three altars to take a power-up for the rest of the run.

## In the hands
Walk onto an altar and stand there for under a second. That's the whole input. Your partner sees you walk there, and your colour lands on the altar. The rest is the normal game: the gates are chokepoints to hold or wall shut.

## Why it's interesting
- A run-scoped build: lean into a style for one run (Pyre for a fire player, Bloom for the healer, Bedrock and Clockwork for the builder) without permanent number creep.
- The pick happens while the next wave's portals are visible, so it's a question with an answer, not a lottery.
- Preparation pays (pillar 7): the lull before each wave is where gates get walled and glyphed.

## Costs & risks
- Flat-number power-ups (Wellspring, Glass heart) press on pillar 1.
- Twelve built power-ups to read; each needs a glyph and a one-line rule that read at a glance.
- Balance is placeholder.

## Open questions
See the questions in `../explorations/2026-11-05-survive-mode.md`.
- **Answered:** 1–4 are built on Claude's recommendations (altars, one each and shareable; portals open during the pick; flat power-ups allowed in run modes; Bloom as a deliberate pick) ([Build optimistically](../decisions/README.md#2026-11-05-build-optimistically)). 5: Rally and Echo, both built ([Survive gets Rally and Echo](../decisions/README.md#2026-11-05-survive-gets-rally-and-echo)). 7: the arena grew to 48 x 34 ([Survive grows to 48 x 34](../decisions/README.md#2026-11-05-survive-grows-to-48-x-34-guards-read-from-behind-a-stalled-page-no-longer-drops-the-others)).
- **Still open:** 6 (the difficulty curve past wave 8), 8 (zooming out when the team splits), 9 (the keep's walls), and 10–12 (Rally's break rule, Echo's repeat cost, Echo as a one-shot).

## Smallest test
Built: `#survive` in the game. Play a few runs solo and with a partner; rate which power-ups get picked and which feel dead.
